"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTech } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";
import { fullnessFor } from "@/lib/paintFullness";
import type { BucketFullness, SrType, WashReason } from "@/lib/types";

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export type WashQueueItem = {
  srId: number;
  srCode: string;
  srType: SrType;
  screenNumber: number;
  cartCode: string | null;
  shelfCode: string | null;
  reason: WashReason;
  lastUsedAt: string | null;
  useCount: number;
};

export type RetirementReportRow = {
  srId: number;
  srCode: string;
  srType: SrType;
  screenNumber: number;
  firstShotAt: string;
  lastUsedAt: string | null;
  useCount: number;
};

export type ScreensDashboard = {
  onFloor: number;
  inProduction: number;
  washQueue: WashQueueItem[];
  fullyReclaimableScreens: { screenNumber: number; dueCount: number }[];
  washedPool: { srCode: string; design: string | null; washedAt: string | null; useCount: number }[];
  cartCapacity: { code: string; shelfCount: number; occupied: number; available: number }[];
  neverUsedCount: number;
  retirementReport: RetirementReportRow[];
};

export type ColorsDashboard = {
  colorsLogged: number;
  inkLevels: { pmsCode: string; name: string; hex: string; currentAmount: number; totalCapacity: number; pctRemaining: number; fullness: BucketFullness }[];
  fullnessCounts: Record<BucketFullness, number>;
  mostUsedInks: { pmsCode: string; name: string; hex: string; totalAdded: number }[];
  freshnessWarnings: { pmsCode: string; name: string; hex: string; lastUsedAt: string | null; createdAt: string }[];
};

export async function getScreensDashboard(): Promise<ScreensDashboard> {
  await requireTech();
  const supabase = await createSupabaseServerClient();

  const [onFloor, inProduction, activeSrRows, queueRows, washedRows, cartRows] = await Promise.all([
    supabase.from("screen_status").select("*", { count: "exact", head: true }).eq("screen_status", "active").eq("derived_status", "on_shelf"),
    supabase.from("screen_status").select("*", { count: "exact", head: true }).eq("screen_status", "active").eq("derived_status", "in_production"),
    supabase.from("separation_references").select("screen_id, use_count").eq("status", "active"),
    // Explicit, actionable wash queue — real SR codes, location, and why each is due.
    supabase.from("wash_queue").select("*").order("wash_requested_at", { ascending: true, nullsFirst: true }),
    supabase
      .from("separation_references")
      .select("sr_code, design_name, washed_at, use_count")
      .eq("status", "washed")
      .order("washed_at", { ascending: false })
      .limit(20),
    supabase.from("cart_capacity").select("*").order("cart_id"),
  ]);

  const washQueue: WashQueueItem[] = (queueRows.data ?? []).map((r) => ({
    srId: r.sr_id,
    srCode: r.sr_code,
    srType: r.sr_type,
    screenNumber: r.screen_number,
    cartCode: r.cart_code,
    shelfCode: r.shelf_code,
    reason: r.reason,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
  }));

  const byScreen = new Map<number, { screenNumber: number; dueCount: number }>();
  for (const r of queueRows.data ?? []) {
    const entry = byScreen.get(r.screen_id) ?? { screenNumber: r.screen_number, dueCount: 0 };
    entry.dueCount += 1;
    byScreen.set(r.screen_id, entry);
  }
  const totalActiveByScreen = new Map<number, number>();
  for (const r of activeSrRows.data ?? []) {
    totalActiveByScreen.set(r.screen_id, (totalActiveByScreen.get(r.screen_id) ?? 0) + 1);
  }
  const fullyReclaimableScreens = [...byScreen.entries()]
    .filter(([screenId, s]) => s.dueCount === (totalActiveByScreen.get(screenId) ?? 0))
    .map(([, s]) => s);

  const neverUsedCount = (activeSrRows.data ?? []).filter((r) => r.use_count === 0).length;

  const { data: reportRows } = await supabase
    .from("sr_usage_report")
    .select("*")
    .order("use_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(20);
  const retirementReport: RetirementReportRow[] = (reportRows ?? []).map((r) => ({
    srId: r.sr_id,
    srCode: r.sr_code,
    srType: r.sr_type,
    screenNumber: r.screen_number,
    firstShotAt: r.first_shot_at,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
  }));

  return {
    onFloor: onFloor.count ?? 0,
    inProduction: inProduction.count ?? 0,
    washQueue,
    fullyReclaimableScreens,
    washedPool: (washedRows.data ?? []).map((r) => ({ srCode: r.sr_code, design: r.design_name, washedAt: r.washed_at, useCount: r.use_count })),
    cartCapacity: (cartRows.data ?? []).map((c) => ({ code: c.cart_code, shelfCount: c.shelf_count, occupied: c.occupied, available: c.available })),
    neverUsedCount,
    retirementReport,
  };
}

export async function getColorsDashboard(): Promise<ColorsDashboard> {
  await requireTech();
  const supabase = await createSupabaseServerClient();
  const settings = await getSettings();
  const cutoff = monthsAgo(settings.inkFreshnessMonths);

  const [levelRows, usageRows] = await Promise.all([
    supabase.from("ink_level_by_color").select("*").order("pms_code"),
    supabase.from("ink_usage_by_color").select("*").order("total_added", { ascending: false }).limit(5),
  ]);

  const inkLevels = (levelRows.data ?? []).map((r) => {
    const current = Number(r.current_amount);
    const total = Number(r.total_capacity);
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const fullness = fullnessFor(pct, settings.fullnessFullPct, settings.fullnessMediumPct, settings.fullnessEmptyPct);
    return { pmsCode: r.pms_code, name: r.name, hex: r.hex ?? "#8B9AAA", currentAmount: current, totalCapacity: total, pctRemaining: pct, fullness };
  });

  const freshnessWarnings = (levelRows.data ?? [])
    .filter((r) => new Date(r.last_used_at ?? r.created_at) < cutoff)
    .map((r) => ({ pmsCode: r.pms_code, name: r.name, hex: r.hex ?? "#8B9AAA", lastUsedAt: r.last_used_at, createdAt: r.created_at }));

  const fullnessCounts: Record<BucketFullness, number> = { full: 0, medium: 0, low: 0, empty: 0 };
  for (const r of inkLevels) fullnessCounts[r.fullness] += 1;

  return {
    colorsLogged: levelRows.data?.length ?? 0,
    inkLevels,
    fullnessCounts,
    mostUsedInks: (usageRows.data ?? []).map((r) => ({ pmsCode: r.pms_code, name: r.name, hex: r.hex ?? "#8B9AAA", totalAdded: Number(r.total_added) })),
    freshnessWarnings,
  };
}
