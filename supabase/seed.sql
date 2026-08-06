-- ============================================================================
-- Screen + Color Locator — seed data (run once, after 0001_init.sql, in the
-- Supabase SQL Editor). This is plain SQL on purpose: seeding no longer runs
-- from a script with the secret key — see the note at the bottom for creating
-- demo tech/admin logins, which does need one manual step in the dashboard.
--
-- Safe to run only against a fresh project. Re-running will hit unique-key
-- violations (carts.code, screens.screen_number, paint_colors.pms_code, ...);
-- truncate the relevant tables first if you need to reseed.
-- ============================================================================

-- ---------- carts A..Z + AA,BB,CC,DD (30 shelves each) -----------------------
with cart_codes as (
  select unnest(array[
    'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
    'AA','BB','CC','DD'
  ]) as code
),
inserted_carts as (
  insert into carts (code, label, shelf_count)
  select code, 'Cart ' || code, 30 from cart_codes
  returning id, code
)
insert into shelves (cart_id, code, barcode, position)
select ic.id, ic.code || n, 'SHLF-' || ic.code || '-' || lpad(n::text, 2, '0'), n
from inserted_carts ic
cross join generate_series(1, 30) as n;

-- ---------- screens 1..900 (empty frames; SRs are added via the app) --------
insert into screens (screen_number)
select generate_series(1, 900);

-- ---------- settings defaults -------------------------------------------------
-- Demo multi-bucket approval code: 1234 — change it from the Settings page
-- before real use.
insert into settings (key, value) values
  ('default_bucket_size_unit', 'g'),
  ('multi_bucket_approval_code', crypt('1234', gen_salt('bf'))),
  ('ink_freshness_months', '12'),
  ('screen_wash_stale_months', '12'),
  ('max_sr_per_screen', ''),
  ('bucket_fullness_full_pct', '70'),
  ('bucket_fullness_medium_pct', '30'),
  ('bucket_fullness_empty_pct', '10');

-- ---------- bucket type ---------------------------------------------------------
-- One 'Standard' container: 150g empty (tare), holds 800g of ink when full.
-- Adjust to your shop's real container before going live — add more types
-- from Settings if you use more than one size/container.
insert into bucket_types (name, tare_weight, capacity, is_default)
values ('Standard', 150, 800, true);

-- ---------- paint colors / bins / buckets / opening ink levels ---------------
-- From files/paint-colors-seed-template.csv. initial_status 'full' is
-- remapped to 'available' (the v6 schema's bucket-status vocabulary).
-- Opening levels are illustrative — available ~80% of capacity, in_use ~40%,
-- empty 0 — replace with real weigh-ins once you have them. Seeded as a
-- 'weigh' event (raw scale reading = tare + ink), matching how the app
-- actually records levels.
with raw(pms_code, name, hex, rack, bin, initial_status) as (
  values
    ('PMS-021',   'Blaze Orange',    '#FF6A13', 'Rack 1', 'Bin A2', 'in_use'),
    ('PMS-185',   'Race Red',        '#E4002B', 'Rack 2', 'Bin C4', 'full'),
    ('PMS-286',   'Royal Blue',      '#0033A0', 'Rack 3', 'Bin B1', 'empty'),
    ('PMS-102',   'Lemon Yellow',    '#F6D500', 'Rack 1', 'Bin A5', 'in_use'),
    ('PMS-354',   'Kelly Green',     '#00A651', 'Rack 2', 'Bin C1', 'full'),
    ('PMS-232',   'Hot Magenta',     '#EC0F8A', 'Rack 2', 'Bin C7', 'full'),
    ('PMS-2593',  'Grape Purple',    '#6B3FA0', 'Rack 3', 'Bin B6', 'empty'),
    ('PMS-BLACK', 'Press Black',     '#14181C', 'Rack 4', 'Bin D1', 'full'),
    ('PMS-WHITE', 'Opaque White',    '#EDEDED', 'Rack 4', 'Bin D2', 'empty'),
    ('PMS-2727',  'Sky Blue',        '#307FE2', 'Rack 3', 'Bin B2', 'full'),
    ('PMS-165',   'Safety Orange',   '#FE5000', 'Rack 1', 'Bin A3', 'in_use'),
    ('PMS-877',   'Silver Metallic', '#8A8D8F', 'Rack 4', 'Bin D6', 'empty')
),
mapped as (
  select
    pms_code, name, hex, rack, bin,
    case initial_status when 'in_use' then 'in_use' when 'empty' then 'empty' else 'available' end as status
  from raw
),
standard_type as (
  select id, tare_weight, capacity from bucket_types where name = 'Standard'
),
inserted_colors as (
  insert into paint_colors (pms_code, name, hex)
  select pms_code, name, nullif(hex, '') from mapped
  returning id, pms_code
),
inserted_bins as (
  insert into paint_bins (rack, bin)
  select distinct rack, bin from mapped
  returning id, rack, bin
),
bucket_source as (
  select
    ic.id as color_id, ib.id as bin_id, st.id as bucket_type_id, m.status,
    case m.status when 'empty' then 0 when 'in_use' then round(st.capacity * 0.4) else round(st.capacity * 0.8) end as current_amount,
    st.tare_weight
  from mapped m
  join inserted_colors ic on ic.pms_code = m.pms_code
  join inserted_bins ib on ib.rack = m.rack and ib.bin = m.bin
  cross join standard_type st
),
inserted_buckets as (
  insert into paint_buckets (paint_color_id, bin_id, bucket_type_id, current_amount, last_weighed_at, last_measured_weight, status, is_primary)
  select color_id, bin_id, bucket_type_id, current_amount, now(), tare_weight + current_amount, status, true from bucket_source
  returning id, current_amount, last_measured_weight
)
insert into ink_events (bucket_id, event_type, amount, actor)
select id, 'weigh', last_measured_weight, 'seed' from inserted_buckets where current_amount > 0;

-- ============================================================================
-- Demo tech/admin logins — two manual steps (needs the Auth Admin API, which
-- means doing this in the dashboard rather than SQL, same as Package Help
-- Desk's Manage Users flow):
--
--   1. Supabase Dashboard → Authentication → Users → Add user. Create one
--      user for a tech (e.g. tech@example.com) and one for an admin
--      (e.g. admin@example.com), with whatever password you want. Copy each
--      user's UUID from the Users list.
--
--   2. Run this, once per user, with their real UUID/name/role:
--
--        insert into profiles (id, name, role)
--        values ('00000000-0000-0000-0000-000000000000', 'Demo Tech', 'tech');
--
--      (role must be 'tech' or 'admin')
-- ============================================================================
