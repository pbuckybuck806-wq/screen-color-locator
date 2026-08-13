-- ============================================================================
-- Screen + Color Locator — migration 0004: shelf lookup matches code OR barcode
-- ----------------------------------------------------------------------------
-- rpc_return_screen and rpc_place_screen only matched the shelves.barcode
-- column (the auto-generated SHLF-<cart>-<NN> value), case-sensitively. In
-- practice techs scan or type the shelf's plain position code (e.g. "B1",
-- shelves.code) instead, which never matched — every attempt failed with
-- "That barcode isn't a recognized shelf." regardless of scanning vs typing.
-- Fix: accept either column, case-insensitively.
-- ============================================================================

create or replace function rpc_return_screen(p_screen_id bigint, p_barcode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shelf_id bigint;
  v_checkout_id bigint;
  v_sr_id bigint;
  v_sr_type text;
begin
  select id into v_shelf_id from shelves
    where upper(barcode) = upper(trim(p_barcode)) or upper(code) = upper(trim(p_barcode));
  if v_shelf_id is null then
    raise exception 'That isn''t a recognized shelf.';
  end if;

  select id, separation_reference_id into v_checkout_id, v_sr_id
  from checkouts where screen_id = p_screen_id and returned_at is null;
  if v_checkout_id is not null then
    update checkouts set returned_at = now(), returned_shelf_id = v_shelf_id where id = v_checkout_id;

    -- One-off SRs auto-queue for wash the moment their job is returned.
    select sr_type into v_sr_type from separation_references where id = v_sr_id;
    if v_sr_type = 'one_off' then
      update separation_references
        set wash_requested_at = now(), wash_requested_reason = 'one_off_returned'
        where id = v_sr_id;
    end if;
  end if;

  update placements set removed_at = now() where screen_id = p_screen_id and removed_at is null;
  insert into placements (screen_id, shelf_id, placed_via_scan) values (p_screen_id, v_shelf_id, true);
end;
$$;

create or replace function rpc_place_screen(p_screen_id bigint, p_barcode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shelf_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  select id into v_shelf_id from shelves
    where upper(barcode) = upper(trim(p_barcode)) or upper(code) = upper(trim(p_barcode));
  if v_shelf_id is null then
    raise exception 'That isn''t a recognized shelf.';
  end if;

  update placements set removed_at = now() where screen_id = p_screen_id and removed_at is null;
  insert into placements (screen_id, shelf_id, placed_via_scan) values (p_screen_id, v_shelf_id, true);
end;
$$;
