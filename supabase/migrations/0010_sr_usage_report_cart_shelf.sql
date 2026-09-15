-- ============================================================================
-- Screen + Color Locator — migration 0010: add cart/shelf to SR usage report
-- ----------------------------------------------------------------------------
-- Adds current cart/shelf location as trailing columns on sr_usage_report,
-- same left-join pattern wash_queue already uses — null for SRs whose screen
-- isn't currently placed anywhere, or that are washed/decommissioned and no
-- longer attached to a screen at all. Powers a cart filter/column on the
-- retirement report. Output column list only grows (safe create-or-replace).
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
  sr.differentiator,
  c.code as cart_code,
  sh.code as shelf_code
from separation_references sr
left join screens s on s.id = sr.screen_id
left join placements p on p.screen_id = s.id and p.removed_at is null
left join shelves sh on sh.id = p.shelf_id
left join carts c on c.id = sh.cart_id;
