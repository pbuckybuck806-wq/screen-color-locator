"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, CartWithShelves } from "@/lib/types";

export async function logCart(code: string, shelfCount: number): Promise<ActionResult<{ cartId: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data: cartId, error } = await supabase.rpc("rpc_log_cart", { p_code: code, p_shelf_count: shelfCount });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { cartId: cartId as number } };
}

export async function listCartsWithShelves(): Promise<ActionResult<CartWithShelves[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("rpc_admin_list_carts_with_shelves");
  if (error) return { ok: false, error: error.message };

  const carts = new Map<number, CartWithShelves>();
  for (const row of data ?? []) {
    if (!carts.has(row.cart_id)) {
      carts.set(row.cart_id, { cartId: row.cart_id, cartCode: row.cart_code, shelfCount: row.shelf_count, shelves: [] });
    }
    carts.get(row.cart_id)!.shelves.push({
      shelfId: row.shelf_id,
      position: row.shelf_position,
      code: row.shelf_code,
      barcode: row.shelf_barcode,
      occupied: row.shelf_occupied,
    });
  }

  return { ok: true, data: Array.from(carts.values()) };
}

export async function editCartShelfCount(cartId: number, newShelfCount: number): Promise<ActionResult<{ saved: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_edit_cart", { p_cart_id: cartId, p_new_shelf_count: newShelfCount });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { saved: true } };
}

export async function editShelfBarcode(shelfId: number, newBarcode: string): Promise<ActionResult<{ saved: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_edit_shelf_barcode", { p_shelf_id: shelfId, p_new_barcode: newBarcode });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { saved: true } };
}

export async function deleteCart(cartId: number, approvalCode: string): Promise<ActionResult<{ deleted: true }>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("rpc_admin_delete_cart", { p_cart_id: cartId, p_approval_code: approvalCode });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { deleted: true } };
}
