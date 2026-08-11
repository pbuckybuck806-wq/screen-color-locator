-- ============================================================================
-- Screen + Color Locator — migration 0003: open cart editing to tech role
-- ----------------------------------------------------------------------------
-- 0002 made the whole Manage Carts screen admin-only. That was too narrow —
-- editing a cart's slot count or fixing a shelf barcode isn't destructive and
-- was explicitly asked to be available to techs too, not just admins. Only
-- force-deleting a cart (rpc_admin_delete_cart, unchanged here) stays
-- admin-only, since that's the one gated behind the approval PIN.
-- ============================================================================

create or replace function rpc_admin_edit_cart(p_cart_id bigint, p_new_shelf_count int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_current_count int;
  v_blocking int;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if p_new_shelf_count is null or p_new_shelf_count <= 0 then
    raise exception 'Enter a number of slots greater than zero.';
  end if;

  select code, shelf_count into v_code, v_current_count from carts where id = p_cart_id;
  if v_code is null then
    raise exception 'Cart not found.';
  end if;

  if p_new_shelf_count > v_current_count then
    insert into shelves (cart_id, code, barcode, position)
    select p_cart_id, v_code || n, 'SHLF-' || v_code || '-' || lpad(n::text, 2, '0'), n
    from generate_series(v_current_count + 1, p_new_shelf_count) as n;
  elsif p_new_shelf_count < v_current_count then
    select count(*) into v_blocking
      from shelves sh
      where sh.cart_id = p_cart_id and sh.position > p_new_shelf_count
        and exists (select 1 from placements p where p.shelf_id = sh.id);
    if v_blocking > 0 then
      raise exception 'Cannot shrink to % slots — % of the shelves being removed have placement history. Delete the cart (with approval) if you need to force it.', p_new_shelf_count, v_blocking;
    end if;
    delete from shelves where cart_id = p_cart_id and position > p_new_shelf_count;
  end if;

  update carts set shelf_count = p_new_shelf_count where id = p_cart_id;
end;
$$;

create or replace function rpc_admin_edit_shelf_barcode(p_shelf_id bigint, p_new_barcode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if p_new_barcode is null or trim(p_new_barcode) = '' then
    raise exception 'Enter a barcode value.';
  end if;

  begin
    update shelves set barcode = trim(p_new_barcode) where id = p_shelf_id;
  exception when unique_violation then
    raise exception 'That barcode is already assigned to another shelf.';
  end;

  if not found then
    raise exception 'Shelf not found.';
  end if;
end;
$$;

create or replace function rpc_admin_list_carts_with_shelves()
returns table (
  cart_id bigint, cart_code text, shelf_count int,
  shelf_id bigint, shelf_position int, shelf_code text, shelf_barcode text, shelf_occupied boolean
) language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  return query
  select
    ca.id, ca.code, ca.shelf_count,
    sh.id, sh.position, sh.code, sh.barcode,
    exists (select 1 from placements p where p.shelf_id = sh.id and p.removed_at is null)
  from carts ca
  join shelves sh on sh.cart_id = ca.id
  order by ca.code, sh.position;
end;
$$;
