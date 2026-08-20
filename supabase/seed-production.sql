-- ============================================================================
-- Screen + Color Locator — PRODUCTION seed (run once, after all 8 migrations,
-- in the production project's SQL Editor).
--
-- This is a trimmed version of supabase/seed.sql — it sets up the physical
-- inventory scaffolding only (carts/shelves, blank screen frames). It
-- deliberately skips:
--   - Paint colors/buckets/ink levels — log real ones via the app's
--     "Log a color" flow once you have your real PMS list ready.
--   - The demo approval code and bucket type — set these for real via the
--     app's Settings page after you create your first admin login (next
--     step after this one). Nothing in the app requires a bucket type to
--     exist until you actually log a color, so there's no rush.
--
-- Safe to run only against a fresh project. Re-running will hit unique-key
-- violations (carts.code, screens.screen_number); truncate first if you
-- need to reseed.
-- ============================================================================

-- ---------- carts A..Z + AA,BB,CC,DD (30 shelves each, placeholder) ----------
-- Uniform 30-per-cart to start — correct real per-cart counts later via the
-- Manage Carts screen (Tech tools → Manage carts) once you've walked the
-- floor and confirmed actual shelf counts.
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

-- ============================================================================
-- Next: create your real tech/admin login(s) — same two manual steps as
-- sandbox, just done here in the production project:
--
--   1. Supabase Dashboard → Authentication → Users → Add user. Create a real
--      account with a real email and a real password. Copy the user's UUID
--      from the Users list.
--
--   2. Run this, once per user, with their real UUID/name/role:
--
--        insert into profiles (id, name, role)
--        values ('00000000-0000-0000-0000-000000000000', 'Real Name', 'admin');
--
--      (role must be 'tech' or 'admin')
--
-- After that, sign in and set the real approval code + bucket type from the
-- Settings page — no SQL needed for either.
-- ============================================================================
