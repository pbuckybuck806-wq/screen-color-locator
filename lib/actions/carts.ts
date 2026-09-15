"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTech } from "@/lib/auth";
import type { ActionResult, CartDetail, CartDetailShelf, CartDetailSr, CartWithShelves } from "@/lib/types";

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

// Read-only "what's actually in this cart" view — screen number + active SR
// codes per occupied shelf. Separate from listCartsWithShelves (which powers
// Manage Carts' editing UI) since this needs heavier per-shelf lookups that
// the editing screen doesn't.
export async function getCartDetail(cartCode: string): Promise<ActionResult<CartDetail>> {
  await requireTech();
  const supabase = await createSupabaseServerClient();

  const { data: cart } = await supabase.from("carts").select("id, code, shelf_count").eq("code", cartCode).maybeSingle();
  if (!cart) return { ok: false, error: "Cart not found." };

  const { data: shelfRows } = await supabase.from("shelves").select("id, position, code, barcode").eq("cart_id", cart.id).order("position");

  const shelfIds = (shelfRows ?? []).map((s) => s.id);
  const { data: placementRows } = await supabase
    .from("placements")
    .select("shelf_id, screen_id, screens(screen_number)")
    .in("shelf_id", shelfIds.length ? shelfIds : [-1])
    .is("removed_at", null);

  const screenByShelf = new Map(
    (placementRows ?? []).map((p) => [
      p.shelf_id,
      { screenId: p.screen_id, screenNumber: (p.screens as unknown as { screen_number: number } | null)?.screen_number ?? null },
    ]),
  );

  const screenIds = [...screenByShelf.values()].map((v) => v.screenId).filter((id): id is number => id != null);
  const { data: srRows } = await supabase
    .from("separation_references")
    .select("id, screen_id, sr_code, differentiator, sr_type, first_shot_at")
    .in("screen_id", screenIds.length ? screenIds : [-1])
    .eq("status", "active");

  const srsByScreen = new Map<number, CartDetailSr[]>();
  for (const r of srRows ?? []) {
    const list = srsByScreen.get(r.screen_id) ?? [];
    list.push({ srId: r.id, code: r.sr_code, differentiator: r.differentiator, srType: r.sr_type, firstShotAt: r.first_shot_at });
    srsByScreen.set(r.screen_id, list);
  }

  const shelves: CartDetailShelf[] = (shelfRows ?? []).map((s) => {
    const occ = screenByShelf.get(s.id);
    return {
      shelfId: s.id,
      position: s.position,
      code: s.code,
      barcode: s.barcode,
      screenNumber: occ?.screenNumber ?? null,
      srs: occ?.screenId != null ? (srsByScreen.get(occ.screenId) ?? []) : [],
    };
  });

  return {
    ok: true,
    data: {
      cartCode: cart.code,
      shelfCount: cart.shelf_count,
      occupied: shelves.filter((s) => s.screenNumber != null).length,
      shelves,
    },
  };
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
