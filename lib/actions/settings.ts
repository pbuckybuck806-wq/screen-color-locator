"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, BucketType, SettingsData } from "@/lib/types";

export async function getSettings(): Promise<SettingsData> {
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: bucketTypeRows }] = await Promise.all([
    supabase.from("public_settings").select("*").maybeSingle(),
    supabase.from("bucket_types").select("id, name, tare_weight, capacity, is_default").order("id"),
  ]);

  const bucketTypes: BucketType[] = (bucketTypeRows ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    tareWeight: Number(b.tare_weight),
    capacity: Number(b.capacity),
    isDefault: b.is_default,
  }));

  return {
    unit: data?.unit || "g",
    inkFreshnessMonths: Number(data?.ink_freshness_months ?? 12),
    screenWashStaleMonths: Number(data?.screen_wash_stale_months ?? 12),
    maxSrPerScreen: data?.max_sr_per_screen ? Number(data.max_sr_per_screen) : null,
    hasApprovalCode: Boolean(data?.has_approval_code),
    fullnessFullPct: Number(data?.bucket_fullness_full_pct ?? 70),
    fullnessMediumPct: Number(data?.bucket_fullness_medium_pct ?? 30),
    fullnessEmptyPct: Number(data?.bucket_fullness_empty_pct ?? 10),
    bucketTypes,
  };
}

export async function updateSettings(input: {
  unit: string;
  inkFreshnessMonths: number;
  screenWashStaleMonths: number;
  maxSrPerScreen: number | null;
  fullnessFullPct: number;
  fullnessMediumPct: number;
  fullnessEmptyPct: number;
  newApprovalCode?: string;
}): Promise<ActionResult<{ saved: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_update_settings", {
    p_unit: input.unit || "g",
    p_ink_freshness_months: input.inkFreshnessMonths,
    p_wash_stale_months: input.screenWashStaleMonths,
    p_max_sr_per_screen: input.maxSrPerScreen,
    p_fullness_full_pct: input.fullnessFullPct,
    p_fullness_medium_pct: input.fullnessMediumPct,
    p_fullness_empty_pct: input.fullnessEmptyPct,
    p_new_approval_code: input.newApprovalCode ?? null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { saved: true } };
}

export async function upsertBucketType(input: {
  id?: number;
  name: string;
  tareWeight: number;
  capacity: number;
  isDefault: boolean;
}): Promise<ActionResult<{ id: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("rpc_admin_upsert_bucket_type", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_tare_weight: input.tareWeight,
    p_capacity: input.capacity,
    p_is_default: input.isDefault,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { id: data as number } };
}
