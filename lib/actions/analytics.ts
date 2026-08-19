"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTech } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";
import { fullnessFor } from "@/lib/paintFullness";
import type { BucketFullness, SrType, SrStatus, WashReason } from "@/lib/types";

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export type WashQueueItem = {
  srId: number;
  srCode: string;
  differentiator: string | null;
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
  differentiator: string | null;
  srType: SrType;
  status: SrStatus;
  screenNumber: number | null;
  firstShotAt: string;
  lastUsedAt: string | null;
  useCount: number;
};

export type InProductionItem = {
  srId: number;
  srCode: string;
  differentiator: string | null;
  screenNumber: number;
  cartCode: string | null;
  shelfCode: string | null;
  checkedOutAt: string;
};

export type ScreensDashboard = {
  onFloor: number;
  inProduction: number;
  inProductionList: InProductionItem[];
  washQueue: WashQueueItem[];
  fullyReclaimableScreens: { screenNumber: number; dueCount: number }[];
  washedPool: { srId: number; srCode: string; differentiator: string | null; design: string | null; washedAt: string | null; useCount: number }[];
  cartCapacity: { code: string; shelfCount: number; occupied: number; available: number }[];
  neverUsedCount: number;
  retirementReportCount: number;
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

  const [onFloor, inProdScreens, activeSrRows, queueRows, washedRows, cartRows, retirementCount] = await Promise.all([
    // "On the floor" means actually placed on a shelf — not just "not checked
    // out," which would otherwise include every never-logged blank screen.
    supabase
      .from("screen_status")
      .select("*", { count: "exact", head: true })
      .eq("screen_status", "active")
      .eq("derived_status", "on_shelf")
      .not("shelf_id", "is", null),
    // Real rows (not just a count) so the "In production" tile can expand
    // into an actual list — which SR, which screen, taken from where.
    supabase
      .from("screen_status")
      .select("screen_id, screen_number, shelf_code, cart_code, active_checkout_ref_id")
      .eq("screen_status", "active")
      .eq("derived_status", "in_production"),
    supabase.from("separation_references").select("screen_id, use_count").eq("status", "active"),
    // Explicit, actionable wash queue — real SR codes, location, and why each is due.
    supabase.from("wash_queue").select("*").order("wash_requested_at", { ascending: true, nullsFirst: true }),
    supabase
      .from("separation_references")
      .select("id, sr_code, differentiator, design_name, washed_at, use_count")
      .eq("status", "washed")
      .order("washed_at", { ascending: false })
      .limit(20),
    supabase.from("cart_capacity").select("*").order("cart_id"),
    supabase.from("sr_usage_report").select("*", { count: "exact", head: true }),
  ]);

  const refIds = (inProdScreens.data ?? [])
    .map((s) => s.active_checkout_ref_id)
    .filter((id): id is number => id != null);
  const [srInfoRows, checkoutRows] = await Promise.all([
    supabase.from("separation_references").select("id, sr_code, differentiator").in("id", refIds.length ? refIds : [-1]),
    supabase.from("checkouts").select("separation_reference_id, checked_out_at").in("separation_reference_id", refIds.length ? refIds : [-1]).is("returned_at", null),
  ]);
  const srInfoMap = new Map((srInfoRows.data ?? []).map((r) => [r.id, r]));
  const checkedOutAtMap = new Map((checkoutRows.data ?? []).map((r) => [r.separation_reference_id, r.checked_out_at]));

  const inProductionList: InProductionItem[] = (inProdScreens.data ?? [])
    .filter((s): s is typeof s & { active_checkout_ref_id: number } => s.active_checkout_ref_id != null)
    .map((s) => {
      const sr = srInfoMap.get(s.active_checkout_ref_id);
      return {
        srId: s.active_checkout_ref_id,
        srCode: sr?.sr_code ?? "",
        differentiator: sr?.differentiator ?? null,
        screenNumber: s.screen_number,
        cartCode: s.cart_code,
        shelfCode: s.shelf_code,
        checkedOutAt: checkedOutAtMap.get(s.active_checkout_ref_id) ?? "",
      };
    })
    .sort((a, b) => (a.checkedOutAt < b.checkedOutAt ? 1 : -1));

  const washQueue: WashQueueItem[] = (queueRows.data ?? []).map((r) => ({
    srId: r.sr_id,
    srCode: r.sr_code,
    differentiator: r.differentiator,
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

  return {
    onFloor: onFloor.count ?? 0,
    inProduction: inProductionList.length,
    inProductionList,
    washQueue,
    fullyReclaimableScreens,
    washedPool: (washedRows.data ?? []).map((r) => ({
      srId: r.id,
      srCode: r.sr_code,
      differentiator: r.differentiator,
      design: r.design_name,
      washedAt: r.washed_at,
      useCount: r.use_count,
    })),
    cartCapacity: (cartRows.data ?? []).map((c) => ({ code: c.cart_code, shelfCount: c.shelf_count, occupied: c.occupied, available: c.available })),
    neverUsedCount,
    retirementReportCount: retirementCount.count ?? 0,
  };
}

// Full report lives on its own page (app/analytics/retirement-report) since
// the list made the main Analytics page grow too long — no practical row
// cap here since that page has the room for it.
export async function getRetirementReport(): Promise<RetirementReportRow[]> {
  await requireTech();
  const supabase = await createSupabaseServerClient();

  const { data: reportRows } = await supabase
    .from("sr_usage_report")
    .select("*")
    .order("use_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1000);

  return (reportRows ?? []).map((r) => ({
    srId: r.sr_id,
    srCode: r.sr_code,
    differentiator: r.differentiator,
    srType: r.sr_type,
    status: r.status,
    screenNumber: r.screen_number,
    firstShotAt: r.first_shot_at,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
  }));
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
