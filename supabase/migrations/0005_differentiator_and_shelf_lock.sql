-- ============================================================================
-- Screen + Color Locator — migration 0005: differentiator + return-shelf lock
-- ----------------------------------------------------------------------------
-- Two behavior changes, learned from the floor:
--
-- 1. The same SR code is reused across multiple designs/screens now — it's no
--    longer globally unique. Adds separation_references.differentiator (a
--    free-text tag the tech enters to tell two same-coded SRs apart) and
--    rescopes the "already active" and "washed, re-shoot" lookups in
--    rpc_log_screen from sr_code alone to (sr_code, differentiator). A
--    functional unique index backs this at the DB level too, same pattern as
--    the other partial unique indexes in this schema.
--
-- 2. A checked-out screen must come back to the exact shelf it was taken
--    from. Since a checkout never clears the screen's active placement (only
--    return/re-place does), that placement's shelf already IS "where it was
--    taken from" for the whole time it's checked out — no new column needed.
--    rpc_return_screen now rejects a return to any other shelf while a
--    checkout is active, naming the correct shelf. Tech/admin can still move
--    a screen to a different shelf at any time via rpc_place_screen
--    (unchanged, still ungated by checkout state) — that's the override.
-- ============================================================================

alter table separation_references add column if not exists differentiator text;

-- Same idea as one_active_sr_code_per_screen, but global: no two ACTIVE SRs
-- may share the same (sr_code, differentiator) pair on any screen. Two SRs
-- with the same code and no differentiator still collide (coalesce to ''),
-- forcing a differentiator only when a code is actually being reused.
create unique index if not exists one_active_sr_code_differentiator
  on separation_references (sr_code, (coalesce(differentiator, '')))
  where status = 'active';

create or replace function rpc_log_screen(p_screen_number int, p_srs jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_screen_id bigint;
  v_screen_status text;
  v_existing_active int;
  v_max_srs text;
  v_sr jsonb;
  v_code text;
  v_diff text;
  v_sr_type text;
  v_active_elsewhere bigint;
  v_washed_id bigint;
  v_from_screen bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  select id, status into v_screen_id, v_screen_status from screens where screen_number = p_screen_number;
  if v_screen_id is null then
    insert into screens (screen_number) values (p_screen_number) returning id, status into v_screen_id, v_screen_status;
  end if;
  if v_screen_status is distinct from 'active' then
    raise exception 'That screen is decommissioned.';
  end if;

  select count(*) into v_existing_active from separation_references where screen_id = v_screen_id and status = 'active';
  select value into v_max_srs from settings where key = 'max_sr_per_screen';
  if v_max_srs is not null and v_max_srs <> '' and
     v_existing_active + jsonb_array_length(p_srs) > v_max_srs::int then
    raise exception 'This screen can only hold % active references.', v_max_srs;
  end if;

  for v_sr in select * from jsonb_array_elements(p_srs) loop
    v_code := upper(trim(v_sr->>'sr_code'));
    continue when v_code = '';

    v_diff := nullif(trim(v_sr->>'differentiator'), '');

    v_sr_type := v_sr->>'sr_type';
    if v_sr_type is null or v_sr_type not in ('permanent', 'one_off') then
      raise exception 'Reference % needs a type: permanent or one-off.', v_code;
    end if;

    select id into v_active_elsewhere from separation_references
      where sr_code = v_code and coalesce(differentiator, '') = coalesce(v_diff, '') and status = 'active';
    if v_active_elsewhere is not null then
      raise exception 'Reference % is already active — add a differentiator to tell this one apart.', v_code;
    end if;

    select id into v_washed_id from separation_references
      where sr_code = v_code and coalesce(differentiator, '') = coalesce(v_diff, '') and status = 'washed';
    if v_washed_id is not null then
      select wev.screen_id into v_from_screen
      from wash_event_srs wes join wash_events wev on wev.id = wes.wash_event_id
      where wes.separation_reference_id = v_washed_id
      order by wev.washed_at desc limit 1;

      update separation_references set screen_id = v_screen_id, status = 'active', washed_at = null where id = v_washed_id;
      if v_from_screen is not null then
        insert into sr_reassignments (separation_reference_id, from_screen_id, to_screen_id, reason)
          values (v_washed_id, v_from_screen, v_screen_id, 're-shoot');
      end if;
    else
      insert into separation_references (screen_id, sr_code, differentiator, design_name, first_shot_at, sr_type)
      values (
        v_screen_id, v_code, v_diff, nullif(v_sr->>'design_name', ''),
        coalesce((v_sr->>'first_shot_at')::timestamptz, now()), v_sr_type
      );
    end if;
  end loop;

  return v_screen_id;
end;
$$;

create or replace function rpc_return_screen(p_screen_id bigint, p_barcode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shelf_id bigint;
  v_checkout_id bigint;
  v_sr_id bigint;
  v_sr_type text;
  v_home_shelf_id bigint;
  v_home_shelf_code text;
begin
  select id into v_shelf_id from shelves
    where upper(barcode) = upper(trim(p_barcode)) or upper(code) = upper(trim(p_barcode));
  if v_shelf_id is null then
    raise exception 'That isn''t a recognized shelf.';
  end if;

  select id, separation_reference_id into v_checkout_id, v_sr_id
  from checkouts where screen_id = p_screen_id and returned_at is null;

  if v_checkout_id is not null then
    -- A checkout never clears the screen's active placement, so that
    -- placement's shelf has been "home" for this screen the whole time it
    -- was checked out — enforce returning there, unless a tech/admin has
    -- since relocated it (rpc_place_screen), in which case that new shelf
    -- becomes the required one instead.
    select p.shelf_id, sh.code into v_home_shelf_id, v_home_shelf_code
    from placements p join shelves sh on sh.id = p.shelf_id
    where p.screen_id = p_screen_id and p.removed_at is null;

    if v_home_shelf_id is not null and v_home_shelf_id <> v_shelf_id then
      raise exception 'This screen must go back to shelf %, not this one.', v_home_shelf_code;
    end if;

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

-- Trailing column additions (create or replace view only allows appending,
-- not reordering, existing columns) so techs can tell duplicate-coded SRs
-- apart in the wash queue and retirement report.
create or replace view wash_queue as
select
  sr.id as sr_id,
  sr.sr_code,
  sr.sr_type,
  sr.first_shot_at,
  sr.last_used_at,
  sr.use_count,
  sr.wash_requested_at,
  case
    when sr.wash_requested_at is not null then sr.wash_requested_reason
    else 'stale_permanent'
  end as reason,
  s.id as screen_id,
  s.screen_number,
  c.code as cart_code,
  sh.code as shelf_code,
  sr.differentiator
from separation_references sr
join screens s on s.id = sr.screen_id
left join placements p on p.screen_id = s.id and p.removed_at is null
left join shelves sh on sh.id = p.shelf_id
left join carts c on c.id = sh.cart_id
cross join lateral (
  select coalesce(nullif((select value from settings where key = 'screen_wash_stale_months'), ''), '12')::int as stale_months
) cfg
where sr.status = 'active'
  and (
    sr.wash_requested_at is not null
    or (sr.sr_type = 'permanent' and coalesce(sr.last_used_at, sr.first_shot_at) < now() - (cfg.stale_months || ' months')::interval)
  );

create or replace view sr_usage_report with (security_invoker = true) as
select
  sr.id as sr_id,
  sr.sr_code,
  sr.sr_type,
  sr.status,
  sr.first_shot_at,
  sr.last_used_at,
  sr.use_count,
  s.screen_number,
  sr.differentiator
from separation_references sr
join screens s on s.id = sr.screen_id
where sr.status = 'active';
