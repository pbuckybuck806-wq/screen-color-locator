-- ============================================================================
-- Screen + Color Locator — Supabase migration (v6 domain model, RLS-only)
-- ----------------------------------------------------------------------------
-- The Next.js app runtime holds ONLY the project URL + publishable (anon) key
-- — never the secret/service-role key. All access control lives here, in
-- Postgres:
--   - Reads: RLS SELECT policies open to anon/authenticated (shop-floor state
--     isn't sensitive — the only genuinely secret value, the multi-bucket
--     approval code, is never exposed via any SELECT).
--   - Writes: SECURITY DEFINER RPC functions. Each one enforces the same
--     tech/admin gating the app would otherwise do, but inside Postgres, so
--     it holds even against a direct API call with a valid session — not
--     just through the app's UI.
--   - The approval code is hashed/verified with pgcrypto inside its RPC
--     functions; the hash itself is stored in `settings` but that table has
--     NO SELECT policy at all (not even for admins) — only the RPC functions,
--     which run as the table owner and bypass RLS, can touch it.
--
-- v6: ink levels are now weigh-based, not estimated. Bucket capacity/tare
-- live in `bucket_types` (Settings-managed), not on the bucket itself.
-- `ink_events.event_type` is add | weigh | adjust (no more 'use'): 'weigh'
-- stores the RAW scale reading, and current_amount = reading - tare is
-- computed and stored on the bucket. Also new: tech "log a cart" (name +
-- slot count) auto-generates that cart's barcoded shelves.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- SETTINGS (admin-editable; locked down — see header) -------------
create table settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ---------- PROFILES (tech/admin only; operators have no login/no row) ------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null check (role in ('tech','admin')),
  created_at timestamptz not null default now()
);

-- ---------- CARTS & SHELVES (configurable shelf count) -----------------------
create table carts (
  id          bigserial primary key,
  code        text not null unique,
  label       text,
  shelf_count int not null check (shelf_count > 0),
  created_at  timestamptz not null default now()
);
create table shelves (
  id       bigserial primary key,
  cart_id  bigint not null references carts(id),
  code     text not null unique,
  barcode  text not null unique,
  position int not null
);

-- ---------- SCREENS -----------------------------------------------------------
create table screens (
  id                   bigserial primary key,
  screen_number        int not null unique check (screen_number between 1 and 900),
  status               text not null default 'active' check (status in ('active','decommissioned')),
  decommissioned_at    timestamptz,
  decommission_reason  text,
  created_at           timestamptz not null default now()
);

-- ---------- SEPARATION REFERENCES (live on a screen indefinitely) ------------
create table separation_references (
  id                   bigserial primary key,
  screen_id            bigint references screens(id),
  sr_code              text not null,
  design_name          text,
  channel              text,
  first_shot_at        timestamptz not null default now(),
  logged_at            timestamptz not null default now(),
  last_used_at         timestamptz,
  use_count            int not null default 0,
  -- SR TYPE (chosen by the tech at logging; immutable afterward):
  --   'permanent' = stays on the screen indefinitely; washed only when stale
  --                 (screen_wash_stale_months) or by manual tech choice.
  --   'one_off'   = tied to a single job; the moment that job's checkout is
  --                 RETURNED, wash_requested_at is set automatically so it
  --                 lands in the wash queue right away instead of lingering.
  sr_type              text not null check (sr_type in ('permanent','one_off')),
  -- WASH QUEUE TRIGGER. Set automatically when a one_off SR's checkout is
  -- returned, or manually by a tech at any time for any SR (this is how "wash
  -- an SR whenever, not just when stale" is implemented as an explicit queue
  -- entry rather than an implicit staleness check). An SR is in the wash
  -- queue if wash_requested_at IS NOT NULL OR (permanent AND stale) — see the
  -- wash_queue view below.
  wash_requested_at    timestamptz,
  -- wash_requested_reason: 'one_off_returned' | 'manual_request' — set
  -- alongside wash_requested_at so the analytics queue can show the real
  -- reason rather than inferring it from sr_type (a one_off SR could also be
  -- manually queued before it's ever returned). Addition beyond the literal
  -- v7 schema, for accuracy — see plan notes.
  wash_requested_reason text check (wash_requested_reason in ('one_off_returned','manual_request')),
  status               text not null default 'active' check (status in ('active','washed','decommissioned')),
  washed_at            timestamptz,
  decommissioned_at    timestamptz,
  decommission_reason  text,
  created_at           timestamptz not null default now()
);
create unique index one_active_sr_code_per_screen
  on separation_references (screen_id, sr_code) where status = 'active';
create index idx_sr_by_code on separation_references (sr_code);
create index idx_sr_last_used on separation_references (last_used_at);
create index idx_sr_wash_requested on separation_references (wash_requested_at) where wash_requested_at is not null;

-- ---------- SR REASSIGNMENT (damaged-screen moves and washed-SR re-shoots) ---
create table sr_reassignments (
  id                       bigserial primary key,
  separation_reference_id  bigint not null references separation_references(id),
  from_screen_id           bigint not null references screens(id),
  to_screen_id             bigint not null references screens(id),
  reason                   text,
  moved_at                 timestamptz not null default now(),
  actor                    text
);

-- ---------- PLACEMENTS / CHECKOUTS / WASH (append-only) ----------------------
create table placements (
  id               bigserial primary key,
  screen_id        bigint not null references screens(id),
  shelf_id         bigint not null references shelves(id),
  placed_at        timestamptz not null default now(),
  removed_at       timestamptz,
  placed_via_scan  boolean not null default true
);
create unique index one_active_placement_per_screen
  on placements (screen_id) where removed_at is null;

create table checkouts (
  id                       bigserial primary key,
  screen_id                bigint not null references screens(id),
  separation_reference_id  bigint not null references separation_references(id),
  checked_out_at           timestamptz not null default now(),
  returned_at              timestamptz,
  returned_shelf_id        bigint references shelves(id)
);
create index active_checkouts on checkouts (screen_id) where returned_at is null;
create unique index one_active_checkout_per_screen
  on checkouts (screen_id) where returned_at is null;

create table wash_events (
  id         bigserial primary key,
  screen_id  bigint not null references screens(id),
  washed_at  timestamptz not null default now(),
  actor      text,
  note       text
);
create table wash_event_srs (
  wash_event_id             bigint not null references wash_events(id),
  separation_reference_id   bigint not null references separation_references(id),
  primary key (wash_event_id, separation_reference_id)
);

-- ============================================================================
-- PAINT / INK — INVENTORY SYSTEM (weigh-based)
-- ============================================================================
create table paint_colors (
  id            bigserial primary key,
  pms_code      text not null unique,
  name          text not null,
  hex           text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Bucket TYPES (Settings-managed). One 'Standard' type by default; admins can
-- add more if containers/sizes vary. full_weight = tare_weight + capacity
-- (derived, not stored).
create table bucket_types (
  id          bigserial primary key,
  name        text not null unique,
  tare_weight numeric not null check (tare_weight >= 0),
  capacity    numeric not null check (capacity > 0),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Only one default type at a time.
create unique index one_default_bucket_type on bucket_types (is_default) where is_default = true;

create table paint_bins (
  id      bigserial primary key,
  rack    text not null,
  bin     text not null,
  barcode text unique,
  unique (rack, bin)
);

-- A physical bucket of one color. bucket_type_id supplies tare + capacity.
-- current_amount is the LIVE ink level, derived from the last 'weigh' event
-- (measured weight minus tare), not from subtracting estimated usage.
create table paint_buckets (
  id                     bigserial primary key,
  paint_color_id         bigint not null references paint_colors(id),
  bucket_type_id         bigint not null references bucket_types(id),
  bin_id                 bigint references paint_bins(id),
  label                  text,
  current_amount         numeric not null default 0,
  last_weighed_at        timestamptz,
  last_measured_weight   numeric,
  status                 text not null default 'available' check (status in ('available','in_use','empty')),
  is_primary             boolean not null default true,
  approved_by            text,
  approved_at            timestamptz,
  created_at             timestamptz not null default now(),
  last_used_at           timestamptz
);
create index idx_buckets_color on paint_buckets (paint_color_id);

-- Append-only ink ledger.
--   'add'    = mixing/adding ink. Operator enters GRAMS ADDED per the shop's
--              Ink Mixing System (stays manual — it's already exact).
--   'weigh'  = operator weighs the bucket at put-away. amount = the RAW scale
--              reading (gross weight, tare included). The app computes
--              current_amount = amount - bucket_types.tare_weight.
--   'adjust' = rare manual correction (schema support only; no UI yet).
create table ink_events (
  id          bigserial primary key,
  bucket_id   bigint not null references paint_buckets(id),
  event_type  text not null check (event_type in ('add','weigh','adjust')),
  amount      numeric not null,
  unit        text not null default 'g',
  job_ref     text,
  actor       text,
  created_at  timestamptz not null default now()
);
create index idx_ink_events_bucket on ink_events (bucket_id);

-- ---------- AUDIT LOG ----------------------------------------------------------
create table events (
  id          bigserial primary key,
  entity_type text not null,
  entity_id   bigint not null,
  event_type  text not null,
  payload     jsonb,
  actor       text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- READ-SIDE VIEWS
-- ============================================================================

create view screen_status with (security_invoker = true) as
select
  s.id as screen_id,
  s.screen_number,
  s.status as screen_status,
  case when ac.id is not null then 'in_production' else 'on_shelf' end as derived_status,
  ac.id as active_checkout_id,
  ac.separation_reference_id as active_checkout_ref_id,
  p.shelf_id,
  sh.code as shelf_code,
  c.code as cart_code
from screens s
left join lateral (
  select co.id, co.separation_reference_id
  from checkouts co
  where co.screen_id = s.id and co.returned_at is null
  limit 1
) ac on true
left join placements p on p.screen_id = s.id and p.removed_at is null
left join shelves sh on sh.id = p.shelf_id
left join carts c on c.id = sh.cart_id;

create view cart_capacity with (security_invoker = true) as
select
  ca.id as cart_id,
  ca.code as cart_code,
  ca.shelf_count,
  count(p.id) as occupied,
  ca.shelf_count - count(p.id) as available
from carts ca
join shelves sh on sh.cart_id = ca.id
left join placements p on p.shelf_id = sh.id and p.removed_at is null
group by ca.id, ca.code, ca.shelf_count;

-- Explicit wash queue (v8): every active SR currently due, with the actual
-- SR code, its screen/shelf/cart location, why it's due, its type, and its
-- usage history — the list a tech works from directly. NOT security_invoker:
-- it needs to read the live screen_wash_stale_months threshold out of the
-- locked-down `settings` table (same reasoning as public_settings).
create view wash_queue as
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
  sh.code as shelf_code
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

-- SR Usage & Retirement Report (v8): every active SR's usage history, for
-- spotting rarely-used designs to retire manually before staleness would
-- flag them. security_invoker=true since it only reads openly-readable
-- tables (no settings dependency).
create view sr_usage_report with (security_invoker = true) as
select
  sr.id as sr_id,
  sr.sr_code,
  sr.sr_type,
  sr.status,
  sr.first_shot_at,
  sr.last_used_at,
  sr.use_count,
  s.screen_number
from separation_references sr
join screens s on s.id = sr.screen_id
where sr.status = 'active';

-- "Most-used ink" (proactive ordering) is driven by grams ADDED (mixing
-- frequency/volume), per v6 — there's no more 'use' event to sum.
create view ink_usage_by_color with (security_invoker = true) as
select
  pc.id as paint_color_id,
  pc.pms_code,
  pc.name,
  pc.hex,
  coalesce(sum(ie.amount) filter (where ie.event_type = 'add'), 0) as total_added
from paint_colors pc
join paint_buckets pb on pb.paint_color_id = pc.id
left join ink_events ie on ie.bucket_id = pb.id
group by pc.id, pc.pms_code, pc.name, pc.hex;

create view ink_level_by_color with (security_invoker = true) as
select
  pc.id as paint_color_id,
  pc.pms_code,
  pc.name,
  pc.hex,
  pc.created_at,
  pc.last_used_at,
  coalesce(sum(pb.current_amount), 0) as current_amount,
  coalesce(sum(bt.capacity), 0) as total_capacity,
  count(pb.id) as bucket_count
from paint_colors pc
left join paint_buckets pb on pb.paint_color_id = pc.id
left join bucket_types bt on bt.id = pb.bucket_type_id
group by pc.id, pc.pms_code, pc.name, pc.hex, pc.created_at, pc.last_used_at;

-- Safe projection of `settings` — everything except the approval-code hash.
-- NOT security_invoker: it intentionally reads the locked-down `settings`
-- table as its owner so anon/authenticated can get thresholds/unit without
-- ever being granted SELECT on the raw table.
create view public_settings as
select
  max(value) filter (where key = 'default_bucket_size_unit') as unit,
  max(value) filter (where key = 'ink_freshness_months') as ink_freshness_months,
  max(value) filter (where key = 'screen_wash_stale_months') as screen_wash_stale_months,
  max(value) filter (where key = 'max_sr_per_screen') as max_sr_per_screen,
  max(value) filter (where key = 'bucket_fullness_full_pct') as bucket_fullness_full_pct,
  max(value) filter (where key = 'bucket_fullness_medium_pct') as bucket_fullness_medium_pct,
  max(value) filter (where key = 'bucket_fullness_empty_pct') as bucket_fullness_empty_pct,
  bool_or(key = 'multi_bucket_approval_code' and coalesce(value, '') <> '') as has_approval_code
from settings;

-- ---------- HELPFUL INDEXES --------------------------------------------------
create index idx_colors_code on paint_colors (pms_code);

-- ============================================================================
-- ROLE HELPER (used inside RPC functions to gate tech/admin actions)
-- ============================================================================
create or replace function current_user_role() returns text
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- ============================================================================
-- ROW LEVEL SECURITY — reads
-- ============================================================================
-- Schema-level prerequisite for the table/view GRANTs and function EXECUTE
-- grants below to mean anything. A brand-new Supabase project sets this up
-- automatically, but it's asserted explicitly here so this script is
-- self-contained even against a manually dropped-and-recreated public schema.
grant usage on schema public to anon, authenticated;

alter table settings enable row level security;                 -- no policies: locked down entirely
alter table profiles enable row level security;
alter table carts enable row level security;
alter table shelves enable row level security;
alter table screens enable row level security;
alter table separation_references enable row level security;
alter table sr_reassignments enable row level security;
alter table placements enable row level security;
alter table checkouts enable row level security;
alter table wash_events enable row level security;
alter table wash_event_srs enable row level security;
alter table paint_colors enable row level security;
alter table bucket_types enable row level security;
alter table paint_bins enable row level security;
alter table paint_buckets enable row level security;
alter table ink_events enable row level security;
alter table events enable row level security;

-- Shop-floor state is not sensitive — open reads. All writes go through the
-- RPC functions below, never direct table access from the client.
create policy read_carts on carts for select using (true);
create policy read_shelves on shelves for select using (true);
create policy read_screens on screens for select using (true);
create policy read_srs on separation_references for select using (true);
create policy read_sr_reassignments on sr_reassignments for select using (true);
create policy read_placements on placements for select using (true);
create policy read_checkouts on checkouts for select using (true);
create policy read_wash_events on wash_events for select using (true);
create policy read_wash_event_srs on wash_event_srs for select using (true);
create policy read_paint_colors on paint_colors for select using (true);
create policy read_bucket_types on bucket_types for select using (true);
create policy read_paint_bins on paint_bins for select using (true);
create policy read_paint_buckets on paint_buckets for select using (true);
create policy read_ink_events on ink_events for select using (true);

-- A signed-in user may read only their own profile row (role lookup).
create policy read_own_profile on profiles for select using (auth.uid() = id);

grant select on carts, shelves, screens, separation_references, sr_reassignments,
  placements, checkouts, wash_events, wash_event_srs, paint_colors, bucket_types,
  paint_bins, paint_buckets, ink_events, profiles,
  screen_status, cart_capacity, wash_queue, sr_usage_report,
  ink_usage_by_color, ink_level_by_color, public_settings
  to anon, authenticated;

-- ============================================================================
-- RPC FUNCTIONS — writes (SECURITY DEFINER; role checks happen inside)
-- ============================================================================

-- ---------- tech: log a cart (name/code + slot count) -----------------------
create or replace function rpc_log_cart(p_code text, p_shelf_count int)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_code text := trim(p_code);
  v_cart_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if v_code = '' then
    raise exception 'Enter a cart name/code.';
  end if;
  if p_shelf_count is null or p_shelf_count <= 0 then
    raise exception 'Enter a number of slots greater than zero.';
  end if;
  if exists (select 1 from carts where code = v_code) then
    raise exception 'A cart named % already exists.', v_code;
  end if;

  insert into carts (code, label, shelf_count) values (v_code, 'Cart ' || v_code, p_shelf_count) returning id into v_cart_id;

  insert into shelves (cart_id, code, barcode, position)
  select v_cart_id, v_code || n, 'SHLF-' || v_code || '-' || lpad(n::text, 2, '0'), n
  from generate_series(1, p_shelf_count) as n;

  return v_cart_id;
end;
$$;

-- ---------- checkout / return -------------------------------------------------
create or replace function rpc_checkout_sr(p_sr_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_screen_id bigint;
  v_status text;
begin
  select screen_id, status into v_screen_id, v_status from separation_references where id = p_sr_id;
  if v_status is distinct from 'active' or v_screen_id is null then
    raise exception 'That reference isn''t active on a screen.';
  end if;
  if exists (select 1 from checkouts where screen_id = v_screen_id and returned_at is null) then
    raise exception 'This screen is already checked out to another job.';
  end if;

  insert into checkouts (screen_id, separation_reference_id) values (v_screen_id, p_sr_id);
  update separation_references set use_count = use_count + 1, last_used_at = now() where id = p_sr_id;
end;
$$;

create or replace function rpc_return_screen(p_screen_id bigint, p_barcode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shelf_id bigint;
  v_checkout_id bigint;
  v_sr_id bigint;
  v_sr_type text;
begin
  select id into v_shelf_id from shelves where barcode = trim(p_barcode);
  if v_shelf_id is null then
    raise exception 'That barcode isn''t a recognized shelf.';
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

-- ---------- tech: log a screen (SR loop, manual first-shot, washed re-shoot) -
create or replace function rpc_log_screen(p_screen_number int, p_srs jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_screen_id bigint;
  v_screen_status text;
  v_existing_active int;
  v_max_srs text;
  v_sr jsonb;
  v_code text;
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

    v_sr_type := v_sr->>'sr_type';
    if v_sr_type is null or v_sr_type not in ('permanent', 'one_off') then
      raise exception 'Reference % needs a type: permanent or one-off.', v_code;
    end if;

    select id into v_active_elsewhere from separation_references where sr_code = v_code and status = 'active';
    if v_active_elsewhere is not null then
      raise exception 'Reference % is already active on another screen.', v_code;
    end if;

    select id into v_washed_id from separation_references where sr_code = v_code and status = 'washed';
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
      insert into separation_references (screen_id, sr_code, design_name, channel, first_shot_at, sr_type)
      values (
        v_screen_id, v_code, nullif(v_sr->>'design_name', ''), nullif(v_sr->>'channel', ''),
        coalesce((v_sr->>'first_shot_at')::timestamptz, now()), v_sr_type
      );
    end if;
  end loop;

  return v_screen_id;
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

  select id into v_shelf_id from shelves where barcode = trim(p_barcode);
  if v_shelf_id is null then
    raise exception 'That barcode isn''t a recognized shelf.';
  end if;

  update placements set removed_at = now() where screen_id = p_screen_id and removed_at is null;
  insert into placements (screen_id, shelf_id, placed_via_scan) values (p_screen_id, v_shelf_id, true);
end;
$$;

-- ---------- tech: wash an SR (detach, tag washed/decommissioned) ------------
create or replace function rpc_wash_sr(p_sr_id bigint, p_tag text, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_screen_id bigint;
  v_status text;
  v_sr_type text;
  v_wash_requested_reason text;
  v_wash_event_id bigint;
  v_default_reason text;
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

  return v_screen_id;
end;
$$;

-- Manually queue an SR for wash without washing it right now (the third way
-- into the queue, alongside a returned one-off or a stale permanent SR) — a
-- tech flags it from Analytics or the locator so it shows up in the queue
-- for whoever pulls carts next.
create or replace function rpc_request_wash(p_sr_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  select status into v_status from separation_references where id = p_sr_id;
  if v_status is distinct from 'active' then
    raise exception 'That reference isn''t active.';
  end if;

  update separation_references
    set wash_requested_at = now(), wash_requested_reason = 'manual_request'
    where id = p_sr_id;
end;
$$;

-- ---------- tech: decommission a damaged screen + reassign its SRs ---------
create or replace function rpc_decommission_and_reassign_screen(p_damaged_number int, p_target_number int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_damaged_id bigint;
  v_damaged_status text;
  v_target_id bigint;
  v_target_status text;
  v_sr record;
  v_moved int := 0;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if p_damaged_number = p_target_number then
    raise exception 'Target screen must be different from the damaged screen.';
  end if;

  select id, status into v_damaged_id, v_damaged_status from screens where screen_number = p_damaged_number;
  if v_damaged_id is null then
    raise exception 'Damaged screen not found.';
  end if;
  if v_damaged_status is distinct from 'active' then
    raise exception 'That screen is already decommissioned.';
  end if;

  select id, status into v_target_id, v_target_status from screens where screen_number = p_target_number;
  if v_target_id is null then
    insert into screens (screen_number) values (p_target_number) returning id, status into v_target_id, v_target_status;
  end if;
  if v_target_status is distinct from 'active' then
    raise exception 'Target screen is decommissioned.';
  end if;

  for v_sr in select id from separation_references where screen_id = v_damaged_id and status = 'active' loop
    update separation_references set screen_id = v_target_id where id = v_sr.id;
    insert into sr_reassignments (separation_reference_id, from_screen_id, to_screen_id, reason)
      values (v_sr.id, v_damaged_id, v_target_id, 'damaged screen');
    v_moved := v_moved + 1;
  end loop;

  update placements set removed_at = now() where screen_id = v_damaged_id and removed_at is null;
  update screens set status = 'decommissioned', decommissioned_at = now(), decommission_reason = 'damaged' where id = v_damaged_id;

  return v_moved;
end;
$$;

-- ---------- tech: log a color / add a bucket --------------------------------
create or replace function find_or_create_bin(p_rack text, p_bin text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  select id into v_id from paint_bins where rack = p_rack and bin = p_bin;
  if v_id is null then
    insert into paint_bins (rack, bin) values (p_rack, p_bin) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function rpc_log_color(p_pms_code text, p_name text, p_hex text, p_rack text, p_bin text, p_bucket_type_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_pms text := upper(trim(p_pms_code));
  v_color_id bigint;
  v_bin_id bigint;
  v_bucket_type_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;
  if exists (select 1 from paint_colors where pms_code = v_pms) then
    raise exception 'That PMS code is already logged — add a bucket to the existing color instead.';
  end if;

  v_bucket_type_id := coalesce(p_bucket_type_id, (select id from bucket_types where is_default = true limit 1));
  if v_bucket_type_id is null then
    raise exception 'No bucket type is configured in Settings yet.';
  end if;

  insert into paint_colors (pms_code, name, hex) values (v_pms, trim(p_name), nullif(p_hex, '')) returning id into v_color_id;
  v_bin_id := find_or_create_bin(trim(p_rack), trim(p_bin));
  insert into paint_buckets (paint_color_id, bin_id, bucket_type_id, is_primary)
    values (v_color_id, v_bin_id, v_bucket_type_id, true);

  return v_color_id;
end;
$$;

create or replace function rpc_add_bucket(p_color_id bigint, p_rack text, p_bin text, p_bucket_type_id bigint, p_approval_code text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_bucket_count int;
  v_is_primary boolean;
  v_stored_hash text;
  v_bin_id bigint;
  v_bucket_type_id bigint;
  v_bucket_id bigint;
begin
  if current_user_role() not in ('tech','admin') then
    raise exception 'Tech sign-in required.';
  end if;

  select count(*) into v_bucket_count from paint_buckets where paint_color_id = p_color_id;
  v_is_primary := v_bucket_count = 0;

  if not v_is_primary then
    select value into v_stored_hash from settings where key = 'multi_bucket_approval_code';
    if v_stored_hash is null or p_approval_code is null or v_stored_hash <> crypt(p_approval_code, v_stored_hash) then
      raise exception 'Incorrect approval code.';
    end if;
  end if;

  v_bucket_type_id := coalesce(p_bucket_type_id, (select id from bucket_types where is_default = true limit 1));
  if v_bucket_type_id is null then
    raise exception 'No bucket type is configured in Settings yet.';
  end if;

  v_bin_id := find_or_create_bin(trim(p_rack), trim(p_bin));
  insert into paint_buckets (paint_color_id, bin_id, bucket_type_id, is_primary, approved_by, approved_at)
    values (
      p_color_id, v_bin_id, v_bucket_type_id, v_is_primary,
      case when v_is_primary then null else (select name from profiles where id = auth.uid()) end,
      case when v_is_primary then null else now() end
    )
    returning id into v_bucket_id;

  return v_bucket_id;
end;
$$;

-- ---------- operator: ink events (add on mix, weigh at put-away) ------------
create or replace function rpc_add_ink(p_bucket_id bigint, p_grams numeric, p_job_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if p_grams is null or p_grams <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  select status into v_status from paint_buckets where id = p_bucket_id;
  if v_status is null then
    raise exception 'Bucket not found.';
  end if;

  insert into ink_events (bucket_id, event_type, amount, job_ref, actor)
    values (p_bucket_id, 'add', p_grams, nullif(p_job_ref, ''), 'operator');

  update paint_buckets set
    current_amount = current_amount + p_grams,
    status = case when v_status = 'empty' then 'available' else v_status end
  where id = p_bucket_id;
end;
$$;

-- Operator weighs the bucket at put-away. p_measured_weight is the RAW scale
-- reading (gross, tare included) — the app never asks for "grams used".
create or replace function rpc_weigh_bucket(p_bucket_id bigint, p_measured_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tare numeric;
  v_status text;
  v_color_id bigint;
  v_computed numeric;
begin
  if p_measured_weight is null or p_measured_weight < 0 then
    raise exception 'Enter the scale reading.';
  end if;

  select bt.tare_weight, pb.status, pb.paint_color_id into v_tare, v_status, v_color_id
  from paint_buckets pb join bucket_types bt on bt.id = pb.bucket_type_id
  where pb.id = p_bucket_id;
  if v_tare is null then
    raise exception 'Bucket not found.';
  end if;

  v_computed := greatest(0, p_measured_weight - v_tare);

  insert into ink_events (bucket_id, event_type, amount, actor)
    values (p_bucket_id, 'weigh', p_measured_weight, 'operator');

  update paint_buckets set
    current_amount = v_computed,
    last_weighed_at = now(),
    last_measured_weight = p_measured_weight,
    last_used_at = now(),
    status = case
      when v_computed <= 0 then 'empty'
      when v_status = 'empty' and v_computed > 0 then 'available'
      else v_status
    end
  where id = p_bucket_id;

  update paint_colors set last_used_at = now() where id = v_color_id;
end;
$$;

create or replace function rpc_mark_bucket_status(p_bucket_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('available','in_use','empty') then
    raise exception 'Invalid status.';
  end if;
  update paint_buckets set status = p_status where id = p_bucket_id;
  if not found then
    raise exception 'Bucket not found.';
  end if;
end;
$$;

-- ---------- admin: settings + bucket types ------------------------------------
create or replace function rpc_admin_update_settings(
  p_unit text, p_ink_freshness_months int, p_wash_stale_months int, p_max_sr_per_screen int,
  p_fullness_full_pct int, p_fullness_medium_pct int, p_fullness_empty_pct int,
  p_new_approval_code text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
  end if;
  if p_new_approval_code is not null and p_new_approval_code !~ '^\d{4}$' then
    raise exception 'Approval code must be exactly 4 digits.';
  end if;

  insert into settings (key, value, updated_at) values
    ('default_bucket_size_unit', coalesce(p_unit, 'g'), now()),
    ('ink_freshness_months', coalesce(p_ink_freshness_months, 12)::text, now()),
    ('screen_wash_stale_months', coalesce(p_wash_stale_months, 12)::text, now()),
    ('max_sr_per_screen', coalesce(p_max_sr_per_screen::text, ''), now()),
    ('bucket_fullness_full_pct', coalesce(p_fullness_full_pct, 70)::text, now()),
    ('bucket_fullness_medium_pct', coalesce(p_fullness_medium_pct, 30)::text, now()),
    ('bucket_fullness_empty_pct', coalesce(p_fullness_empty_pct, 10)::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  if p_new_approval_code is not null then
    insert into settings (key, value, updated_at) values ('multi_bucket_approval_code', crypt(p_new_approval_code, gen_salt('bf')), now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  end if;
end;
$$;

-- Insert (p_id null) or update (p_id set) a bucket type. Setting p_is_default
-- true unsets any previous default first (only one at a time).
create or replace function rpc_admin_upsert_bucket_type(p_id bigint, p_name text, p_tare_weight numeric, p_capacity numeric, p_is_default boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if current_user_role() is distinct from 'admin' then
    raise exception 'Admin sign-in required.';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Enter a bucket type name.';
  end if;
  if p_tare_weight is null or p_tare_weight < 0 or p_capacity is null or p_capacity <= 0 then
    raise exception 'Enter a valid tare weight and capacity.';
  end if;

  if coalesce(p_is_default, false) then
    update bucket_types set is_default = false where is_default = true;
  end if;

  if p_id is null then
    insert into bucket_types (name, tare_weight, capacity, is_default)
    values (trim(p_name), p_tare_weight, p_capacity, coalesce(p_is_default, false))
    returning id into v_id;
  else
    update bucket_types
      set name = trim(p_name), tare_weight = p_tare_weight, capacity = p_capacity, is_default = coalesce(p_is_default, is_default)
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'Bucket type not found.';
    end if;
  end if;

  return v_id;
end;
$$;

-- ---------- lock down execution, then grant explicitly -----------------------
-- Targeted revokes (not a schema-wide revoke) so extension functions like
-- pgcrypto's crypt()/gen_salt() are never touched.
revoke execute on function
  rpc_log_cart(text, int), rpc_checkout_sr(bigint), rpc_return_screen(bigint, text),
  rpc_add_ink(bigint, numeric, text), rpc_weigh_bucket(bigint, numeric), rpc_mark_bucket_status(bigint, text),
  rpc_log_screen(int, jsonb), rpc_place_screen(bigint, text), rpc_wash_sr(bigint, text, text),
  rpc_request_wash(bigint),
  rpc_decommission_and_reassign_screen(int, int), rpc_log_color(text, text, text, text, text, bigint),
  rpc_add_bucket(bigint, text, text, bigint, text),
  rpc_admin_update_settings(text, int, int, int, int, int, int, text),
  rpc_admin_upsert_bucket_type(bigint, text, numeric, numeric, boolean),
  find_or_create_bin(text, text), current_user_role()
  from public;

grant execute on function
  rpc_checkout_sr(bigint), rpc_return_screen(bigint, text),
  rpc_add_ink(bigint, numeric, text), rpc_weigh_bucket(bigint, numeric), rpc_mark_bucket_status(bigint, text)
  to anon, authenticated;

grant execute on function
  rpc_log_cart(text, int), rpc_log_screen(int, jsonb), rpc_place_screen(bigint, text), rpc_wash_sr(bigint, text, text),
  rpc_request_wash(bigint),
  rpc_decommission_and_reassign_screen(int, int), rpc_log_color(text, text, text, text, text, bigint),
  rpc_add_bucket(bigint, text, text, bigint, text)
  to authenticated;

grant execute on function
  rpc_admin_update_settings(text, int, int, int, int, int, int, text),
  rpc_admin_upsert_bucket_type(bigint, text, numeric, numeric, boolean)
  to authenticated;

grant execute on function current_user_role() to authenticated, anon;
