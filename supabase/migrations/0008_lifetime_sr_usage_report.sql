-- ============================================================================
-- Screen + Color Locator — migration 0008: SR Usage Report becomes lifetime
-- ----------------------------------------------------------------------------
-- sr_usage_report only ever showed currently-active SRs (`where status =
-- 'active'`, inner-joined to screens). Once an SR is washed or
-- decommissioned it detaches from its screen (screen_id goes null), so even
-- without the status filter the inner join would have dropped it anyway.
-- Removing the filter and switching to a left join makes this a true
-- lifetime record — every SR ever logged, regardless of status, with
-- screen_number simply null for ones no longer attached to a screen. The
-- output column list is unchanged (same names/order/types), so this is a
-- safe create-or-replace.
-- ============================================================================

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
left join screens s on s.id = sr.screen_id;
