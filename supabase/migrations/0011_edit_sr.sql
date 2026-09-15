-- ============================================================================
-- Screen + Color Locator — migration 0011: edit an active SR in place
-- ----------------------------------------------------------------------------
-- Fixing a typo (e.g. an SR code entered with dashes when it shouldn't have
-- them) previously meant deleting the reference and re-logging it — losing
-- its use_count, first_shot_at, and wash/reassignment history in the
-- process. This lets tech/admin correct the fields entered at logging time
-- in place: code, differentiator, design name, type, first shot date.
-- Re-validates the same (sr_code, differentiator) uniqueness rule used at
-- logging, excluding the row being edited itself.
-- ============================================================================

create or replace function rpc_edit_sr(
  p_sr_id bigint, p_sr_code text, p_differentiator text, p_design_name text, p_sr_type text, p_first_shot_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_code text := upper(trim(p_sr_code));
  v_diff text := nullif(trim(p_differentiator), '');
  v_conflict bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if v_code = '' then
    raise exception 'Enter a reference number.';
  end if;
  if p_sr_type not in ('permanent','one_off') then
    raise exception 'Choose Permanent or One-off.';
  end if;
  if p_first_shot_at is null then
    raise exception 'Enter a first shot date.';
  end if;

  select status into v_status from separation_references where id = p_sr_id;
  if v_status is null then
    raise exception 'Reference not found.';
  end if;
  if v_status is distinct from 'active' then
    raise exception 'Only active references can be edited.';
  end if;

  select id into v_conflict from separation_references
    where sr_code = v_code and coalesce(differentiator, '') = coalesce(v_diff, '') and status = 'active' and id <> p_sr_id;
  if v_conflict is not null then
    raise exception 'Reference % is already active — add a differentiator to tell it apart.', v_code;
  end if;

  update separation_references
    set sr_code = v_code, differentiator = v_diff, design_name = nullif(trim(p_design_name), ''),
        sr_type = p_sr_type, first_shot_at = p_first_shot_at
    where id = p_sr_id;
end;
$$;

revoke execute on function rpc_edit_sr(bigint, text, text, text, text, timestamptz) from public;
grant execute on function rpc_edit_sr(bigint, text, text, text, text, timestamptz) to authenticated;
