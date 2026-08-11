-- ============================================================================
-- Screen + Color Locator — migration 0002: admin delete + cart editing
-- ----------------------------------------------------------------------------
-- Adds, on top of 0001_init.sql:
--   - Force-delete for carts, screens, and separation references. These are
--     the one deliberate exception to the append-only design used everywhere
--     else in this schema — the admin explicitly asked for a way to remove
--     bad/test data, including entries with real history attached. Each
--     delete is admin-only AND requires the same 4-digit multi-bucket
--     approval code used elsewhere (reused, not a separate code), then
--     cascades through every dependent row in FK-safe order so the DELETE
--     itself can't fail on a foreign-key violation.
--   - Cart editing: change shelf_count (grow freely; shrink is blocked if any
--     shelf being removed has ever had a placement — use the approval-gated
--     cart delete instead if that needs to be forced).
--   - Per-shelf barcode editing, so a cart's shelves can be made to match
--     whatever labels are actually on the floor instead of only the
--     auto-generated SHLF-<cart>-<NN> pattern.
--   - A shared verify_approval_code() helper, factored out of rpc_add_bucket
--     so the three new delete functions don't repeat the same hash-compare.
-- ============================================================================

-- ---------- shared approval-code check ---------------------------------------
create or replace function verify_approval_code(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_stored_hash text;
begin
  select value into v_stored_hash from settings where key = 'multi_bucket_approval_code';
  if v_stored_hash is null or p_code is null then
    return false;
  end if;
  return v_stored_hash = crypt(p_code, v_stored_hash);
end;
$$;

create or replace function rpc_add_bucket(p_color_id bigint, p_rack text, p_bin text, p_bucket_type_id bigint, p_approval_code text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_bucket_count int;
  v_is_primary boolean;
  v_bin_id bigint;
  v_bucket_type_id bigint;
  v_bucket_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  select count(*) into v_bucket_count from paint_buckets where paint_color_id = p_color_id;
  v_is_primary := v_bucket_count = 0;

  if not v_is_primary and not verify_approval_code(p_approval_code) then
    raise exception 'Incorrect approval code.';
  end if;

  v_bucket_type_id := coalesce(p_bucket_type_id, (select id from bucket_types where is_default = true limit 1));
  if v_bucket_type_id is null then
    raise exception 'No bucket type is configured in Settings yet.';
  end if;

  v_bin_id := find_or_create_bin(trim(p_rack), trim(p_bin));
  insert into paint_buckets (paint_color_id, bin_id, bucket_type_id, is_primary, approved_by, approved_at)
    values (
      p_color_id, v_bin_id, v_bucket_type_id, v_is_primary,
      case when v_is_primary then null else (select name from profiles where id = auth.uid()) end,
      case when v_is_primary then null else now() end
    )
    returning id into v_bucket_id;

  return v_bucket_id;
end;
$$;

-- ---------- cascade helper: fully remove one separation reference ------------
create or replace function delete_sr_cascade(p_sr_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from checkouts where separation_reference_id = p_sr_id;
  delete from wash_event_srs where separation_reference_id = p_sr_id;
  delete from sr_reassignments where separation_reference_id = p_sr_id;
  delete from separation_references where id = p_sr_id;
end;
$$;

-- ---------- admin: delete a separation reference ------------------------------
create or replace function rpc_admin_delete_sr(p_sr_id bigint, p_approval_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
  end if;
  if not verify_approval_code(p_approval_code) then
    raise exception 'Incorrect approval code.';
  end if;
  if not exists (select 1 from separation_references where id = p_sr_id) then
    raise exception 'Reference not found.';
  end if;

  perform delete_sr_cascade(p_sr_id);
end;
$$;

-- ---------- admin: delete a screen (and every SR it currently carries) -------
create or replace function rpc_admin_delete_screen(p_screen_id bigint, p_approval_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sr record;
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
  end if;
  if not verify_approval_code(p_approval_code) then
    raise exception 'Incorrect approval code.';
  end if;
  if not exists (select 1 from screens where id = p_screen_id) then
    raise exception 'Screen not found.';
  end if;

  for v_sr in select id from separation_references where screen_id = p_screen_id loop
    perform delete_sr_cascade(v_sr.id);
  end loop;

  -- Catches checkouts/reassignments tied to this screen via SRs that have
  -- since moved to a different screen (checkouts.screen_id never changes
  -- after the fact, so delete_sr_cascade above wouldn't reach these).
  delete from checkouts where screen_id = p_screen_id;
  delete from wash_event_srs where wash_event_id in (select id from wash_events where screen_id = p_screen_id);
  delete from wash_events where screen_id = p_screen_id;
  delete from sr_reassignments where from_screen_id = p_screen_id or to_screen_id = p_screen_id;
  delete from placements where screen_id = p_screen_id;
  delete from screens where id = p_screen_id;
end;
$$;

-- ---------- admin: delete a cart (and its shelves) ----------------------------
create or replace function rpc_admin_delete_cart(p_cart_id bigint, p_approval_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
  end if;
  if not verify_approval_code(p_approval_code) then
    raise exception 'Incorrect approval code.';
  end if;
  if not exists (select 1 from carts where id = p_cart_id) then
    raise exception 'Cart not found.';
  end if;

  update checkouts set returned_shelf_id = null
    where returned_shelf_id in (select id from shelves where cart_id = p_cart_id);
  delete from placements where shelf_id in (select id from shelves where cart_id = p_cart_id);
  delete from shelves where cart_id = p_cart_id;
  delete from carts where id = p_cart_id;
end;
$$;

-- ---------- admin: edit a cart's shelf count -----------------------------------
-- Growing adds new shelves at the end (same code/barcode pattern as
-- rpc_log_cart). Shrinking is only allowed when none of the shelves being
-- dropped have ever held a placement — otherwise use rpc_admin_delete_cart
-- (approval-gated) to force it.
create or replace function rpc_admin_edit_cart(p_cart_id bigint, p_new_shelf_count int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_current_count int;
  v_blocking int;
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
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

-- ---------- admin: edit a shelf's barcode --------------------------------------
create or replace function rpc_admin_edit_shelf_barcode(p_shelf_id bigint, p_new_barcode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
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

-- ---------- admin: list carts + shelves for the Manage Carts screen -----------
create or replace function rpc_admin_list_carts_with_shelves()
returns table (
  cart_id bigint, cart_code text, shelf_count int,
  shelf_id bigint, shelf_position int, shelf_code text, shelf_barcode text, shelf_occupied boolean
) language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
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

-- ---------- lock down execution, then grant explicitly -----------------------
revoke execute on function
  verify_approval_code(text), delete_sr_cascade(bigint),
  rpc_admin_delete_sr(bigint, text), rpc_admin_delete_screen(bigint, text), rpc_admin_delete_cart(bigint, text),
  rpc_admin_edit_cart(bigint, int), rpc_admin_edit_shelf_barcode(bigint, text), rpc_admin_list_carts_with_shelves()
  from public;

grant execute on function
  rpc_admin_delete_sr(bigint, text), rpc_admin_delete_screen(bigint, text), rpc_admin_delete_cart(bigint, text),
  rpc_admin_edit_cart(bigint, int), rpc_admin_edit_shelf_barcode(bigint, text), rpc_admin_list_carts_with_shelves()
  to authenticated;
