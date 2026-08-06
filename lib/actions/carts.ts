"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function logCart(code: string, shelfCount: number): Promise<ActionResult<{ cartId: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data: cartId, error } = await supabase.rpc("rpc_log_cart", { p_code: code, p_shelf_count: shelfCount });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { cartId: cartId as number } };
}
