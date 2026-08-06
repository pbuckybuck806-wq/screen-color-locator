"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { fullnessFor } from "@/lib/paintFullness";
import type { ActionResult, BucketRow, BucketStatus, ColorSearchResult } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

async function loadColorState(supabase: SupabaseClient, colorId: number): Promise<ColorSearchResult | null> {
  const { data: color } = await supabase
    .from("paint_colors")
    .select("id, pms_code, name, hex, created_at, last_used_at")
    .eq("id", colorId)
    .maybeSingle();
  if (!color) return null;

  const { data: bucketRows } = await supabase
    .from("paint_buckets")
    .select(
      "id, current_amount, status, is_primary, last_weighed_at, last_measured_weight, paint_bins(rack, bin), bucket_types(id, name, tare_weight, capacity)",
    )
    .eq("paint_color_id", colorId)
    .order("id");

  const settings = await getSettings();
  const cutoff = monthsAgo(settings.inkFreshnessMonths);
  const freshnessReference = color.last_used_at ?? color.created_at;

  const buckets: BucketRow[] = (bucketRows ?? []).map((b) => {
    const bin = b.paint_bins as unknown as { rack: string; bin: string } | null;
    const type = b.bucket_types as unknown as { id: number; name: string; tare_weight: number; capacity: number };
    const currentAmount = Number(b.current_amount);
    const capacity = Number(type.capacity);
    const pct = capacity > 0 ? (currentAmount / capacity) * 100 : 0;
    return {
      id: b.id,
      loc: bin ? `${bin.rack} · ${bin.bin}` : "Unassigned",
      bucketTypeId: type.id,
      bucketTypeName: type.name,
      tareWeight: Number(type.tare_weight),
      capacity,
      currentAmount,
      fullness: fullnessFor(pct, settings.fullnessFullPct, settings.fullnessMediumPct, settings.fullnessEmptyPct),
      status: b.status,
      isPrimary: b.is_primary,
      lastWeighedAt: b.last_weighed_at,
      lastMeasuredWeight: b.last_measured_weight != null ? Number(b.last_measured_weight) : null,
    };
  });

  return {
    colorId: color.id,
    pmsCode: color.pms_code,
    name: color.name,
    hex: color.hex ?? "#8B9AAA",
    createdAt: color.created_at,
    lastUsedAt: color.last_used_at,
    freshnessWarning: new Date(freshnessReference) < cutoff,
    buckets,
  };
}

export async function searchColorByPms(pmsCodeRaw: string): Promise<ColorSearchResult | null> {
  const pmsCode = pmsCodeRaw.trim().toUpperCase();
  if (!pmsCode) return null;
  const supabase = await createSupabaseServerClient();

  const { data: color } = await supabase.from("paint_colors").select("id").eq("pms_code", pmsCode).maybeSingle();
  if (!color) return null;

  return loadColorState(supabase, color.id);
}

export async function checkPmsExists(pmsCodeRaw: string): Promise<{ exists: boolean; colorId: number | null; bucketCount: number }> {
  const pmsCode = pmsCodeRaw.trim().toUpperCase();
  const supabase = await createSupabaseServerClient();
  const { data: color } = await supabase.from("paint_colors").select("id").eq("pms_code", pmsCode).maybeSingle();
  if (!color) return { exists: false, colorId: null, bucketCount: 0 };

  const { count } = await supabase.from("paint_buckets").select("*", { count: "exact", head: true }).eq("paint_color_id", color.id);
  return { exists: true, colorId: color.id, bucketCount: count ?? 0 };
}

export async function logColor(input: {
  pmsCode: string;
  name: string;
  hex?: string;
  rack: string;
  bin: string;
  bucketTypeId?: number;
}): Promise<ActionResult<{ colorId: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data: colorId, error } = await supabase.rpc("rpc_log_color", {
    p_pms_code: input.pmsCode,
    p_name: input.name,
    p_hex: input.hex ?? null,
    p_rack: input.rack,
    p_bin: input.bin,
    p_bucket_type_id: input.bucketTypeId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { colorId: colorId as number } };
}

export async function addBucket(input: {
  colorId: number;
  rack: string;
  bin: string;
  bucketTypeId?: number;
  approvalCode?: string;
}): Promise<ActionResult<ColorSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_add_bucket", {
    p_color_id: input.colorId,
    p_rack: input.rack,
    p_bin: input.bin,
    p_bucket_type_id: input.bucketTypeId ?? null,
    p_approval_code: input.approvalCode ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const data = await loadColorState(supabase, input.colorId);
  if (!data) return { ok: false, error: "Color not found." };
  return { ok: true, data };
}

// Mixing: operator enters exact grams added, per the shop's Ink Mixing System.
export async function addInk(bucketId: number, grams: number, jobRef?: string): Promise<ActionResult<ColorSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { data: bucket } = await supabase.from("paint_buckets").select("paint_color_id").eq("id", bucketId).maybeSingle();
  if (!bucket) return { ok: false, error: "Bucket not found." };

  const { error } = await supabase.rpc("rpc_add_ink", { p_bucket_id: bucketId, p_grams: grams, p_job_ref: jobRef ?? null });
  if (error) return { ok: false, error: error.message };

  const data = await loadColorState(supabase, bucket.paint_color_id);
  if (!data) return { ok: false, error: "Color not found." };
  return { ok: true, data };
}

// Put-away: operator enters the raw scale reading; the app derives the level.
export async function weighBucket(bucketId: number, measuredWeight: number): Promise<ActionResult<ColorSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { data: bucket } = await supabase.from("paint_buckets").select("paint_color_id").eq("id", bucketId).maybeSingle();
  if (!bucket) return { ok: false, error: "Bucket not found." };

  const { error } = await supabase.rpc("rpc_weigh_bucket", { p_bucket_id: bucketId, p_measured_weight: measuredWeight });
  if (error) return { ok: false, error: error.message };

  const data = await loadColorState(supabase, bucket.paint_color_id);
  if (!data) return { ok: false, error: "Color not found." };
  return { ok: true, data };
}

export async function markBucketStatus(bucketId: number, status: BucketStatus): Promise<ActionResult<ColorSearchResult>> {
  const supabase = await createSupabaseServerClient();

  const { data: bucket } = await supabase.from("paint_buckets").select("paint_color_id").eq("id", bucketId).maybeSingle();
  if (!bucket) return { ok: false, error: "Bucket not found." };

  const { error } = await supabase.rpc("rpc_mark_bucket_status", { p_bucket_id: bucketId, p_status: status });
  if (error) return { ok: false, error: error.message };

  const data = await loadColorState(supabase, bucket.paint_color_id);
  if (!data) return { ok: false, error: "Color not found." };
  return { ok: true, data };
}
