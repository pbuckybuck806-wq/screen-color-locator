# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repo currently contains **spec/design artifacts only — no application has been built yet**. There is no package.json, build system, test suite, or source tree. The four files under `files/` (also duplicated in `files.zip`) are the complete build brief for a future implementation:

- [screen-color-locator-PRD.md](files/screen-color-locator-PRD.md) — the full product/build spec. Read this first; it defines scope, user roles, and acceptance criteria.
- [screen-color-locator-schema.sql](files/screen-color-locator-schema.sql) — the target Postgres schema, heavily commented with the design principles it encodes.
- [paint-colors-seed-template.csv](files/paint-colors-seed-template.csv) — sample seed data format for `paint_colors` (replace with the real PMS export before import; strip the trailing `#`-comment lines first).
- [screen-locator-prototype-v6-final.html](files/screen-locator-prototype-v6-final.html) — a single-file, no-build visual/interaction prototype (inline CSS + vanilla JS, ~718 lines). This is the authoritative look-and-feel reference; the real app should match its visuals and animations, not its implementation (it's a throwaway static mockup, not a starting codebase).

When asked to build the app, treat the PRD as the spec of record and the schema as the data-model of record; the prototype HTML is UI/UX reference only.

## Tech stack (not yet chosen)

The PRD says to **detect and mirror the existing "Package Help Desk" app's stack** (look for `package.json` → JS/React/Next, `composer.json` → PHP/Laravel, `requirements.txt`/`manage.py` → Python/Django, `Gemfile` → Rails) so the two apps feel like siblings — but no such sibling repo is present here. If none is found, the PRD's fallback default is **Next.js (React) + PostgreSQL** (e.g. Supabase for DB, auth, and hosting).

## Core domain model (from the schema)

Three design principles are load-bearing and must be preserved by any implementation:

1. **Append-only cycle history.** A physical screen is reused across many wash/reshoot cycles. Each `screen_cycles` row is one life of the screen; only one cycle per screen may be open (`closed_at IS NULL`) at a time (enforced by a partial unique index). All `separation_references`, `placements`, and `checkouts` hang off a specific `screen_cycle_id`. Washing a screen = close the current cycle, open a new one with `cycle_number + 1`; **never update/overwrite prior-cycle rows**. Default searches show only the current (open) cycle; older cycles remain queryable.
2. **Derived status, never stored redundantly.** Screen status is computed, not synced:
   - `in_production` — an active checkout exists (`returned_at IS NULL`)
   - `completed` (due for wash) — no active checkout and every reference in the open cycle is `completed`
   - `on_shelf` — otherwise
   Reference status itself is a stored enum (`pending → in_production → completed`). "2/3 complete" progress = completed references ÷ total references in the current cycle.
3. **Scan-to-return authorization.** There is no operator login. Any "return" action (screen to shelf, implicitly bucket status too) is authorized purely by scanning a barcode (`shelves.barcode`, `paint_bins.barcode`) — never by typing a location. Scanners are USB keyboard-wedge devices: they type the barcode value + Enter into whatever input is focused, so "scanning" is just handling a keydown Enter on a focused text field and looking up by `barcode`. No camera/mobile-vision.

Paint/ink side is simpler and parallel: `paint_colors` (by `pms_code`) → `paint_buckets` (status `full`/`in_use`/`empty`, located via `paint_bins`) with an append-only `bucket_status_events` audit trail per status change. A color can have multiple buckets; any bucket marked `empty` surfaces in the replenishment list.

A generic `events` table is available for cross-entity audit logging (`entity_type`/`entity_id`/`event_type`/`payload`).

## User roles

- **Operator** — no login, public page. Search screens/paint, mark bucket status, return via barcode scan.
- **Tech** — login required. Everything operators can do, plus logging new screens/references, placing screens, sending to wash, and viewing Analytics.
- **Admin** — tech abilities plus user management and seed/maintenance.

Auth should reuse the same mechanism as the existing Package Help Desk app if that repo is available.

## UI/UX requirements (see prototype for exact behavior)

- Persistent sticky top nav, SPA-style instant view switching (no full reloads), role-aware (Analytics tab gated behind login in production).
- Two search modes under one Locator view: **Screens** and **Paint & Colors**, plus a **Hub** landing page and a login-gated **Analytics** console.
- Fonts: Bricolage Grotesque (display) + Inter (body). Dark UI, CMYK-grounded palette (cyan/magenta/yellow/orange + green for complete). Signature motif: registration-mark crosshair.
- Found-result animations differ by mode: Screens = squeegee "print wipe" sweep; Paint & Colors = paint splash colored by the ink's real `hex`. Respect `prefers-reduced-motion`.
- Hub → Locator transition is a "floor-dive" (aerial photo settles into frame); Hub → Package Help Desk has no animation and just routes out.
- Out of scope for v1: responsive/mobile bottom-nav fallback, camera-based scanning, multi-warehouse support, and any deep changes to Package Help Desk beyond the shared hub link.
