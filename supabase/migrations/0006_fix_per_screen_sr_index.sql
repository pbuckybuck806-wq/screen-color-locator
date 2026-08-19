-- ============================================================================
-- Screen + Color Locator — migration 0006: fix stale per-screen SR index
-- ----------------------------------------------------------------------------
-- one_active_sr_code_per_screen predates the differentiator column (0005) —
-- it only covers (screen_id, sr_code), so the DB itself still blocked the
-- same SR code appearing twice on one screen with two different
-- differentiators, even though rpc_log_screen's own pre-check already
-- allows it (that check is scoped to (sr_code, differentiator), same as the
-- global index added in 0005). Confirmed live: logging 123456789/DEN and
-- 123456789/CHI on the same screen hit this exact index.
-- ============================================================================

drop index if exists one_active_sr_code_per_screen;

create unique index one_active_sr_code_per_screen
  on separation_references (screen_id, sr_code, (coalesce(differentiator, '')))
  where status = 'active';
