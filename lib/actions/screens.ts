"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import type { ScreenSearchResult, SrRow, SrType, WashReason, ActionResult } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

async function loadScreenState(supabase: SupabaseClient, screenId: number): Promise<ScreenSearchResult | null> {
  const { data: screenState } = await supabase.from("screen_status").select("*").eq("screen_id", screenId).maybeSingle();
  if (!screenState) return null;

  const { data: srRows } = await supabase
    .from("separation_references")
    .select("id, sr_code, design_name, channel, sr_type, first_shot_at, last_used_at, use_count, wash_requested_at, wash_requested_reason")
    .eq("screen_id", screenId)
    .eq("status", "active")
    .order("id");

  const settings = await getSettings();
  const cutoff = monthsAgo(settings.screenWashStaleMonths);

  // Unified wash-queue rule (matches the wash_queue view): explicitly
  // requested (one-off returned, or a manual flag) OR a stale permanent SR.
  // A one-off SR is never flagged by staleness alone — only by an actual
  // return or manual request.
  const srs: SrRow[] = (srRows ?? []).map((r) => {
    const srType = r.sr_type as SrType;
    const staleReference = r.last_used_at ?? r.first_shot_at;
    const isStalePermanent = srType === "permanent" && new Date(staleReference) < cutoff;
    const washReason: WashReason | null = r.wash_requested_at
      ? (r.wash_requested_reason as WashReason)
      : isStalePermanent
        ? "stale_permanent"
        : null;
    return {
      id: r.id,
      code: r.sr_code,
      design: r.design_name,
      channel: r.channel,
      srType,
      firstShotAt: r.first_shot_at,
      lastUsedAt: r.last_used_at,
      useCount: r.use_count,
      dueForWash: washReason !== null,
      washReason,
      checkedOut: r.id === screenState.active_checkout_ref_id,
    };
  });

  return {
    screenId: screenState.screen_id,
    screen: screenState.screen_number,
    status: screenState.derived_status,
    cart: screenState.cart_code,
    shelf: screenState.shelf_code,
    srs,
  };
}

export async function searchScreenByRef(srCodeRaw: string): Promise<ScreenSearchResult | null> {
  const srCode = srCodeRaw.trim().toUpperCase();
  if (!srCode) return null;
  const supabase = await createSupabaseServerClient();

  const { data: srRow } = await supabase
    .from("separation_references")
    .select("screen_id")
    .eq("sr_code", srCode)
    .eq("status", "active")
    .maybeSingle();
  if (!srRow || !srRow.screen_id) return null;

  return loadScreenState(supabase, srRow.screen_id);
}

export async function lookupScreenByNumber(screenNumber: number): Promise<ScreenSearchResult | null> {
  const supabase = await createSupabaseServerClient();

  const { data: screen } = await supabase.from("screens").select("id, status").eq("screen_number", screenNumber).maybeSingle();
  if (!screen || screen.status !== "active") return null;

  return loadScreenState(supabase, screen.id);
}

export async function checkoutSr(srId: number): Promise<ActionResult<ScreenSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { data: sr } = await supabase.from("separation_references").select("screen_id").eq("id", srId).maybeSingle();
  if (!sr?.screen_id) return { ok: false, error: "That reference isn't active on a screen." };

  const { error } = await supabase.rpc("rpc_checkout_sr", { p_sr_id: srId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const state = await loadScreenState(supabase, sr.screen_id);
  if (!state) return { ok: false, error: "Screen not found." };
  return { ok: true, data: state };
}

export async function returnScreenByBarcode(screenId: number, barcode: string): Promise<ActionResult<ScreenSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_return_screen", { p_screen_id: screenId, p_barcode: barcode });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const state = await loadScreenState(supabase, screenId);
  if (!state) return { ok: false, error: "Screen not found." };
  return { ok: true, data: state };
}

export async function logScreen(
  screenNumber: number,
  srs: { srCode: string; srType: SrType; designName?: string; channel?: string; firstShotAt?: string }[],
): Promise<ActionResult<{ screenId: number }>> {
  if (srs.length === 0) return { ok: false, error: "Enter at least one separation reference." };
  const supabase = await createSupabaseServerClient();

  const { data: screenId, error } = await supabase.rpc("rpc_log_screen", {
    p_screen_number: screenNumber,
    p_srs: srs.map((r) => ({
      sr_code: r.srCode,
      sr_type: r.srType,
      design_name: r.designName ?? null,
      channel: r.channel ?? null,
      first_shot_at: r.firstShotAt ?? null,
    })),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { screenId: screenId as number } };
}

// Manually queue an SR for wash without washing it right now (e.g. flagged
// from Analytics or the SR Usage & Retirement Report).
export async function requestWash(srId: number): Promise<ActionResult<ScreenSearchResult | null>> {
  const supabase = await createSupabaseServerClient();

  const { data: sr } = await supabase.from("separation_references").select("screen_id").eq("id", srId).maybeSingle();

  const { error } = await supabase.rpc("rpc_request_wash", { p_sr_id: srId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const state = sr?.screen_id ? await loadScreenState(supabase, sr.screen_id) : null;
  return { ok: true, data: state };
}

export async function placeScreenByBarcode(screenId: number, barcode: string): Promise<ActionResult<{ placed: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_place_screen", { p_screen_id: screenId, p_barcode: barcode });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: { placed: true } };
}

export async function washSr(
  srId: number,
  tag: "washed" | "decommissioned",
  reason?: string,
): Promise<ActionResult<ScreenSearchResult | null>> {
  const supabase = await createSupabaseServerClient();

  const { data: oldScreenId, error } = await supabase.rpc("rpc_wash_sr", { p_sr_id: srId, p_tag: tag, p_reason: reason ?? null });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const state = oldScreenId ? await loadScreenState(supabase, oldScreenId as number) : null;
  return { ok: true, data: state };
}

export async function decommissionAndReassignScreen(
  damagedScreenNumber: number,
  targetScreenNumber: number,
): Promise<ActionResult<{ movedCount: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data: movedCount, error } = await supabase.rpc("rpc_decommission_and_reassign_screen", {
    p_damaged_number: damagedScreenNumber,
    p_target_number: targetScreenNumber,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { movedCount: movedCount as number } };
}

export async function deleteSr(srId: number, approvalCode: string): Promise<ActionResult<{ deleted: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_delete_sr", { p_sr_id: srId, p_approval_code: approvalCode });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { deleted: true } };
}

export async function deleteScreen(screenId: number, approvalCode: string): Promise<ActionResult<{ deleted: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_delete_screen", { p_screen_id: screenId, p_approval_code: approvalCode });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { deleted: true } };
}
