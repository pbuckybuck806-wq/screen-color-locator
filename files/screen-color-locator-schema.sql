-- ============================================================================
-- Screen + Color Locator — Database Schema  (v7 — SUPERSEDES v6)
-- ----------------------------------------------------------------------------
-- v3 ADDS:
--   • Damaged-screen decommission + re-assign its SRs to a new screen (history
--     carries over).
--   • Cart analytics: total screens assigned per cart (+ space available).
--   • Paint becomes a real INK-INVENTORY system: bucket size, running ink level
--     from add/use events, per-color created/last-used dates, freshness warning,
--     duplicate-PMS warning, multi-bucket behind a 4-digit approval code.
--   • Settings table (default bucket size, approval code [hashed], thresholds).
-- Carried from v2: SRs live indefinitely; screens washed only to decommission
--   unused SRs; usage tracking (first_shot_at manual, last_used_at, use_count);
--   append-only history.
-- ============================================================================

-- ---------- SETTINGS (admin-editable) ---------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,   -- see seed keys below
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Seed keys (confirmed starting values — all editable by management in Settings):
--   'default_bucket_size_unit'    'g'  (grams — PMS mixing formulas are gram-based)
--   'multi_bucket_approval_code'  STORE HASHED, never plaintext (4-digit code)
--   'ink_freshness_months'        '12'  (warn when ink older than this)
--   'screen_wash_stale_months'    '12'  (an SR is "due for wash" after this long unused)
--   'max_sr_per_screen'           '' (blank = no limit)
--   'bucket_fullness_full_pct'    '70' (>= this % = Full)
--   'bucket_fullness_medium_pct'  '30' (>= this % = Medium, below = Low)
--   'bucket_fullness_empty_pct'   '10' (< this % = Empty/refill)
-- Bucket TARE + CAPACITY now live in bucket_types (see below), not settings
-- directly, so multiple container/sizes can coexist; seed one 'Standard' type.

-- ---------- USERS (operators have no login) ---------------------------------
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('tech','admin')),
  password_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CARTS & SHELVES (configurable) ----------------------------------
CREATE TABLE carts (
  id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT,
  shelf_count INT NOT NULL CHECK (shelf_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE shelves (
  id BIGSERIAL PRIMARY KEY, cart_id BIGINT NOT NULL REFERENCES carts(id),
  code TEXT NOT NULL UNIQUE, barcode TEXT NOT NULL UNIQUE, position INT NOT NULL
);
-- Cart analytics: capacity = shelf_count; occupied / "screens assigned to cart"
--   = count of active placements on that cart's shelves; available = capacity - occupied.

-- ---------- SCREENS ---------------------------------------------------------
CREATE TABLE screens (
  id BIGSERIAL PRIMARY KEY,
  screen_number INT NOT NULL UNIQUE CHECK (screen_number BETWEEN 1 AND 900),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','decommissioned')),
  decommissioned_at TIMESTAMPTZ,
  decommission_reason TEXT,     -- e.g. 'damaged'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SEPARATION REFERENCES (live on a screen indefinitely) -----------
CREATE TABLE separation_references (
  id BIGSERIAL PRIMARY KEY,
  screen_id BIGINT REFERENCES screens(id),   -- NULL once washed/decommissioned (detached from any screen)
  sr_code TEXT NOT NULL,
  design_name TEXT,
  channel TEXT,
  first_shot_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- MANUALLY settable (back-fill)
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when entered in the app
  last_used_at  TIMESTAMPTZ,
  use_count     INT NOT NULL DEFAULT 0,

  -- SR TYPE (chosen by the tech when the SR is logged; drives wash behavior):
  --   'permanent' = stays on the screen indefinitely; washed only when stale
  --                 (screen_wash_stale_months) or by manual tech choice.
  --   'one_off'   = tied to a single job; once that job's checkout is RETURNED,
  --                 the app automatically sets wash_requested_at (see below) so
  --                 it lands in the wash queue right away instead of lingering.
  sr_type TEXT NOT NULL CHECK (sr_type IN ('permanent','one_off')),

  -- WASH QUEUE TRIGGER. Set automatically the moment a one_off SR's checkout is
  -- returned; can ALSO be set manually at any time by a tech for ANY SR (this is
  -- how "wash an SR whenever, not just when stale" is implemented). An SR is in
  -- the wash queue if wash_requested_at IS NOT NULL OR (permanent AND stale).
  wash_requested_at TIMESTAMPTZ,

  -- STATUS:
  --   'active'         = currently burned onto a screen (screen_id set)
  --   'washed'         = removed from the screen but STILL ACTIVE/valid; can be
  --                      re-shot onto a screen later (screen_id NULL)
  --   'decommissioned' = retired, no longer active
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','washed','decommissioned')),
  washed_at         TIMESTAMPTZ,
  decommissioned_at TIMESTAMPTZ,
  decommission_reason TEXT,     -- e.g. 'wash_stale', 'wash_one_off_complete', 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_sr_code_per_screen
  ON separation_references (screen_id, sr_code) WHERE status = 'active';
CREATE INDEX idx_sr_by_code ON separation_references (sr_code);
CREATE INDEX idx_sr_last_used ON separation_references (last_used_at);
CREATE INDEX idx_sr_wash_requested ON separation_references (wash_requested_at) WHERE wash_requested_at IS NOT NULL;

-- ---------- SR REASSIGNMENT (damaged screen -> new screen) ------------------
-- ---------- SR REASSIGNMENT (damaged screen -> new screen) ------------------
-- Move an SR to a replacement screen; SR keeps its first_shot_at/use_count/
-- last_used_at. Update separation_references.screen_id AND log the move here.
CREATE TABLE sr_reassignments (
  id BIGSERIAL PRIMARY KEY,
  separation_reference_id BIGINT NOT NULL REFERENCES separation_references(id),
  from_screen_id BIGINT NOT NULL REFERENCES screens(id),
  to_screen_id   BIGINT NOT NULL REFERENCES screens(id),
  reason TEXT,                  -- e.g. 'original screen damaged'
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT
);

-- ---------- PLACEMENTS / CHECKOUTS / WASH (append-only) ---------------------
CREATE TABLE placements (
  id BIGSERIAL PRIMARY KEY, screen_id BIGINT NOT NULL REFERENCES screens(id),
  shelf_id BIGINT NOT NULL REFERENCES shelves(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(), removed_at TIMESTAMPTZ,
  placed_via_scan BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX one_active_placement_per_screen
  ON placements (screen_id) WHERE removed_at IS NULL;

CREATE TABLE checkouts (
  id BIGSERIAL PRIMARY KEY, screen_id BIGINT NOT NULL REFERENCES screens(id),
  separation_reference_id BIGINT NOT NULL REFERENCES separation_references(id),
  checked_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ, returned_shelf_id BIGINT REFERENCES shelves(id)
);
CREATE INDEX active_checkouts ON checkouts (screen_id) WHERE returned_at IS NULL;
-- On checkout: separation_references.use_count += 1; last_used_at = now().
-- On RETURN (returned_at set): if that SR's sr_type = 'one_off', ALSO set
-- separation_references.wash_requested_at = now() automatically, so it lands
-- in the wash queue right away rather than waiting on a staleness threshold.

-- WASHING IS PER-SR, not whole-screen, and can be done ANY TIME — either because
-- an SR is due for wash by staleness, or at the tech's discretion. To wash, the
-- screen is checked out / pulled from its shelf; only the chosen SR(s) are washed,
-- other SRs on the screen stay 'active'.
CREATE TABLE wash_events (
  id BIGSERIAL PRIMARY KEY, screen_id BIGINT NOT NULL REFERENCES screens(id),
  washed_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT, note TEXT
);
-- Which specific SR(s) each wash removed from the screen:
CREATE TABLE wash_event_srs (
  wash_event_id BIGINT NOT NULL REFERENCES wash_events(id),
  separation_reference_id BIGINT NOT NULL REFERENCES separation_references(id),
  PRIMARY KEY (wash_event_id, separation_reference_id)
);
-- After washing an SR it is DETACHED from the screen (screen_id -> NULL) and the
-- tech tags it:
--   'washed'         -> set washed_at; STILL ACTIVE; can be re-shot onto a screen later.
--   'decommissioned' -> set decommissioned_at + decommission_reason; no longer active.
-- The screen returns to a shelf unless it now has no active SRs.

-- ============================================================================
-- PAINT / INK — INVENTORY SYSTEM
-- ============================================================================

-- One row per PMS color. pms_code UNIQUE => app WARNS on duplicate logging.
CREATE TABLE paint_colors (
  id BIGSERIAL PRIMARY KEY,
  pms_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,           -- display name; bucket "name" = this PMS color
  hex TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when first logged
  last_used_at TIMESTAMPTZ                          -- max over its buckets' usage
);

-- Bucket TYPES (Settings-managed). Today there is exactly one type
-- ('Standard'), but this supports multiple sizes/containers later without
-- complicating the common single-type case.
CREATE TABLE bucket_types (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- e.g. 'Standard'
  tare_weight NUMERIC NOT NULL,       -- empty container weight, grams
  capacity    NUMERIC NOT NULL,       -- how much ink it holds when full, grams
  is_default  BOOLEAN NOT NULL DEFAULT false,  -- pre-selected when logging a bucket
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- full_weight (derived, not stored) = tare_weight + capacity

CREATE TABLE paint_bins (
  id BIGSERIAL PRIMARY KEY, rack TEXT NOT NULL, bin TEXT NOT NULL,
  barcode TEXT UNIQUE, UNIQUE (rack, bin)
);

-- A physical bucket of one color. bucket_type_id supplies tare + capacity.
-- current_amount is the LIVE ink level, derived from the last weigh-in (not
-- from subtracting estimated usage).
CREATE TABLE paint_buckets (
  id BIGSERIAL PRIMARY KEY,
  paint_color_id BIGINT NOT NULL REFERENCES paint_colors(id),
  bucket_type_id BIGINT NOT NULL REFERENCES bucket_types(id),
  bin_id BIGINT REFERENCES paint_bins(id),
  label TEXT,                   -- defaults to the PMS color name
  current_amount NUMERIC NOT NULL DEFAULT 0,   -- grams of ink, from last weigh-in
  last_weighed_at TIMESTAMPTZ,
  last_measured_weight NUMERIC, -- raw scale reading (gross, tare included)
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','empty')),
  is_primary BOOLEAN NOT NULL DEFAULT true,    -- first bucket for the color
  approved_by TEXT,             -- for EXTRA buckets: who entered the 4-digit code
  approved_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when bucket first mixed/logged
  last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_buckets_color ON paint_buckets (paint_color_id);
-- % remaining = current_amount / bucket_types.capacity (via bucket_type_id).
-- MULTI-BUCKET RULE: adding a non-primary bucket for a color requires the
-- 4-digit management approval code (settings.multi_bucket_approval_code).
-- FRESHNESS: warn when now() - created_at (or last_used_at) exceeds
-- settings.ink_freshness_months.

-- Append-only ink ledger.
--   'add'   = mixing/adding ink. Operator enters GRAMS ADDED per the shop's
--             Ink Mixing System (stays manual -- it's already exact).
--   'weigh' = operator weighs the bucket at put-away. amount = the RAW scale
--             reading (gross weight, tare included). App computes
--             current_amount = amount - bucket_types.tare_weight and updates
--             paint_buckets.current_amount / last_weighed_at directly. This
--             self-corrects drift instead of compounding usage estimates --
--             no separate "grams used" entry is required.
--   'adjust'= rare manual correction (e.g., scale error, spill).
CREATE TABLE ink_events (
  id BIGSERIAL PRIMARY KEY,
  bucket_id BIGINT NOT NULL REFERENCES paint_buckets(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('add','weigh','adjust')),
  amount NUMERIC NOT NULL,      -- meaning depends on event_type (see above)
  unit TEXT NOT NULL DEFAULT 'g',
  job_ref TEXT,                 -- optional job identifier
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ink_events_bucket ON ink_events (bucket_id);

-- ---------- AUDIT LOG -------------------------------------------------------
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY, entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
  event_type TEXT NOT NULL, payload JSONB, actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DERIVED / ANALYTICS (compute in app or views):
--   Screen status: in_production if active checkout else on_shelf.
--   SR WASH QUEUE (per-SR, unifies both triggers): status='active' SR where
--     wash_requested_at IS NOT NULL   -- one_off returned, or manually requested
--     OR (sr_type='permanent' AND COALESCE(last_used_at, first_shot_at)
--         < now() - screen_wash_stale_months)   -- permanent gone stale
--     Washing removes that SR only; sibling SRs stay 'active'. On wash, tag as
--     status='washed' (decommission_reason NULL) or 'decommissioned'
--     (decommission_reason set, e.g. 'wash_one_off_complete' or 'wash_stale').
--   SR still valid/active = status IN ('active','washed'); inactive = 'decommissioned'.
--   'washed' SRs (detached, still valid) = a pool available to re-shoot onto screens.
--   SR USAGE & RETIREMENT REPORT (management): per SR — first_shot_at, use_count,
--     last_used_at, sr_type, status — so infrequently-used SRs can be identified
--     and manually decommissioned even before they'd hit the staleness threshold.
--   Cart: capacity = shelf_count; assigned/occupied = active placements on it;
--     available = capacity - occupied.
--   Ink level per PMS color = SUM(paint_buckets.current_amount) for that color
--     (current_amount comes from the last 'weigh' event minus that bucket's
--     bucket_types.tare_weight); % remaining = current_amount / capacity.
--   Bucket fullness status (Full/Medium/Low/Empty) = current_amount / capacity,
--     bucketed by thresholds stored in settings (e.g. Full >=70%, Medium 30-70%,
--     Low 10-30%, Empty <10% -- confirm exact cutoffs with the shop).
--   MOST-USED INK (proactive ordering) = SUM(ink_events.amount WHERE type='add')
--     per color over a period, ranked.
--   INK FRESHNESS WARNING = buckets older than ink_freshness_months (by created_at
--     or last_used_at) => "may no longer be in good condition."
--   DUPLICATE PMS = attempt to insert an existing pms_code (blocked by UNIQUE;
--     app should warn before insert).
-- ============================================================================
