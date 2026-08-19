-- ============================================================================
-- Screen + Color Locator — migration 0007: wash requires a destination shelf
-- ----------------------------------------------------------------------------
-- Washing an SR used to be purely a status change (tag washed/decommissioned)
-- with no location effect — the screen's placement was untouched, so once a
-- tech pulled it to actually wash it, the app's idea of "where is this
-- screen" went stale until someone happened to re-place it.
--
-- Now: tagging an SR washed/decommissioned requires resolving a destination
-- shelf (same scan-or-type-code-or-barcode matching as everywhere else), and
-- that becomes the screen's new placement — carrying every other still-active
-- SR on that screen along with it, since location is a screen-level fact,
-- not a per-SR one. This is a straight rpc_wash_sr signature change
-- (3 args -> 4), so the old function is dropped rather than replaced.
-- ============================================================================

drop function if exists rpc_wash_sr(bigint, text, text);

create or replace function rpc_wash_sr(p_sr_id bigint, p_tag text, p_reason text, p_barcode text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_screen_id bigint;
  v_status text;
  v_sr_type text;
  v_wash_requested_reason text;
  v_wash_event_id bigint;
  v_default_reason text;
  v_shelf_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if p_tag not in ('washed','decommissioned') then
    raise exception 'Invalid tag.';
  end if;

  select screen_id, status, sr_type, wash_requested_reason
    into v_screen_id, v_status, v_sr_type, v_wash_requested_reason
    from separation_references where id = p_sr_id;
  if v_status is distinct from 'active' or v_screen_id is null then
    raise exception 'That reference isn''t active on a screen.';
  end if;

  select id into v_shelf_id from shelves
    where upper(barcode) = upper(trim(p_barcode)) or upper(code) = upper(trim(p_barcode));
  if v_shelf_id is null then
    raise exception 'Enter where this screen is going — that isn''t a recognized shelf.';
  end if;

  -- Default decommission reason, when the tech doesn't type one, from why it
  -- was actually due (matches wash_queue's reason values, or 'wash_stale' for
  -- a permanent SR washed without ever being queued).
  v_default_reason := coalesce(v_wash_requested_reason, case when v_sr_type = 'permanent' then 'wash_stale' else null end, 'manual');

  insert into wash_events (screen_id, note) values (v_screen_id, nullif(p_reason, '')) returning id into v_wash_event_id;
  insert into wash_event_srs (wash_event_id, separation_reference_id) values (v_wash_event_id, p_sr_id);

  if p_tag = 'washed' then
    update separation_references
      set screen_id = null, status = 'washed', washed_at = now(), wash_requested_at = null, wash_requested_reason = null
      where id = p_sr_id;
  else
    update separation_references
      set screen_id = null, status = 'decommissioned', decommissioned_at = now(),
        decommission_reason = coalesce(nullif(p_reason, ''), v_default_reason),
        wash_requested_at = null, wash_requested_reason = null
      where id = p_sr_id;
  end if;

  -- The whole physical screen moves with it — washing pulls the mesh off the
  -- shelf, not just the one design being tagged. Any other SR still active
  -- on this screen keeps showing the correct (new) location.
  update placements set removed_at = now() where screen_id = v_screen_id and removed_at is null;
  insert into placements (screen_id, shelf_id, placed_via_scan) values (v_screen_id, v_shelf_id, true);

  return v_screen_id;
end;
$$;

revoke execute on function rpc_wash_sr(bigint, text, text, text) from public;
grant execute on function rpc_wash_sr(bigint, text, text, text) to authenticated;
