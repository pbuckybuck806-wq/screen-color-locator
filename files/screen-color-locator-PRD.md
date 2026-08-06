# Screen + Color Locator — Build Spec (PRD **v8**, supersedes v7)

Pair with `screen-color-locator-schema.sql` (**still v7 — unchanged this round**, no database changes needed) and `paint-colors-seed-template.csv`. Visual reference: `screen-locator-prototype-v6-final.html`.

> **v8 update (analytics clarification, no schema change):** the wash-due analytics view must show the actual **reference #'s (SR codes)** that are due to be washed, not just a count or summary -- listed with their screen/location and the reason each is due. **v7 update (important correction):** Production runs **two kinds of Separation References**, and this changes the wash rule from v6. **Permanent** SRs behave exactly as v6 described (live indefinitely, washed only when stale or by manual choice). **One-off** SRs are tied to a single job — once that job's checkout is **returned, the app automatically queues that SR for washing** rather than leaving it indefinitely. The tech chooses which type an SR is when logging it. Also new: a management **SR Usage & Retirement Report** (first-used date, use count, last-used date per SR) so infrequently-used SRs can be identified and retired manually. **v6:** cart logging flow; weigh-based ink tracking via Bucket Types (tare + capacity); bucket fullness status. **v5:** SR states are active | washed | decommissioned; washing can happen anytime. **v4:** washing is per-SR; thresholds default to 12 months; no SR-per-screen limit; unit is grams. **v3:** damaged-screen reassignment; ink-inventory groundwork; Settings area. **v2:** SRs persist indefinitely by default; append-only history throughout.

---

## 1. What we're building
A shop-floor tool to instantly locate (a) a physical silk-screen among ~900 across ~30 carts, and (b) a bucket of ink — tracking live ink levels by weight, and screen/SR usage for wash and retirement decisions. One app, two modes (**Screens**, **Paint & Colors**), a tech Analytics console, a **Settings** area, joined to Package Help Desk via a shared hub.

## 2. Users & roles
- **Operator** — no login: search screens/paint; check a screen out for production and return it by scanning a shelf; enter grams added when mixing; weigh a bucket at put-away; mark bucket status.
- **Tech** — login: log/register **carts, screens, SRs** (choosing **permanent** or **one-off** per SR), and **paint colors/buckets**; decommission & reassign damaged screens; wash SRs; Analytics.
- **Admin** — login: tech + user management + **Settings**.

## 3. Navigation & layout (firm)
Persistent, sticky, role-aware top nav; instant SPA switching; each view single-purpose and clean; matches the prototype. Operators see the Locator; techs also see Analytics (and Settings for admins).

## 4. Hub
Two tiles — **Screen & Color Locator** and **Package Help Desk**; the locator opens via the "floor-dive" transition. Separate codebases/DBs; likely subdomains. (Note: while both apps are in development, the hub should link to Package Help Desk's **sandbox** environment, switching to production when this app also goes live.)

---

## 5. Screens mode

### 5.1 Tech — log a cart
**"Log a cart"** → enter **cart name/code** → enter **number of slots (shelves)**. The app creates the cart and auto-generates that many barcoded shelves. Carts can have different slot counts from one another. Powers cart capacity analytics in §8.

### 5.2 Tech — log a screen
Screen # → enter an SR# → **choose SR type: Permanent or One-off** (see §5.5) → **"add another SR?"** loop (each new SR also gets a type) → when done, **scan the shelf** to place it → session logged. Each SR captures a **first-shot date the tech can enter manually** (for back-filling screens already on the floor), plus last-used and use-count (start empty/0).

### 5.3 Operator — check out for production
Enter an SR# → check the screen + SR out. App **increments use-count, sets last-used = now**, and blocks other jobs (conflict alert if already out).

### 5.4 Operator — return
**Scan the shelf** → screen is back on the shelf, SRs intact. **Exception:** if the SR just returned is a **one-off**, the app automatically flags it for washing (see §5.5) — the screen can still return to its shelf; the flag just means that SR will be pulled for washing rather than staying on indefinitely.

### 5.5 SR types & washing (per-SR)

**SR type (chosen at logging, per SR):**
- **Permanent** — the design stays on the screen **indefinitely**. Washed only when it goes unused past the staleness threshold (default **12 months**, editable), or whenever a tech manually chooses to wash it.
- **One-off** — tied to a single job. **The moment that job's checkout is returned, the SR is automatically added to the wash queue** — it isn't left sitting indefinitely like a permanent SR.

**The wash queue (unified):** an SR appears in the queue if it's a returned one-off, **or** a permanent SR that's gone stale, **or** any SR a tech manually chose to queue for washing at any time. One queue, three ways in.

**Washing workflow (unchanged mechanics):** the screen is **checked out / pulled from its shelf**; the tech washes the chosen SR; the SR is **detached from the screen**. The tech tags it:
- **Washed** — still active/valid, not currently on a screen; can be re-shot onto a screen later, history intact.
- **Decommissioned** — retired, no longer active.

Other SRs on the same screen **stay active** regardless of type. The screen returns to a shelf unless it now has no active SRs. All append-only — SR rows are never deleted, and which SR each wash removed (and from which screen) is logged.

### 5.6 Damaged screen — decommission & re-assign
If a screen is damaged in production, a tech can **decommission it and re-assign its existing SRs (of either type) to a new screen**. Each moved SR **keeps its history and type**; the move is logged. The old screen is marked decommissioned.

### 5.7 Statuses (derived)
**Screen:** `in_production` if an active checkout exists, else `on_shelf`.
**SR:** `active` (on a screen) · `washed` (detached but still valid, re-shootable) · `decommissioned` (retired). "Still active/valid" = active **or** washed. **SR type:** `permanent` or `one_off`, set at logging, does not change over the SR's life.

---

## 6. Paint & Colors mode — locator **and ink inventory**

### 6.1 Bucket Types (Settings) — tare & capacity
Ink buckets are tracked via a **Bucket Types** table in Settings: name, **tare weight** (empty container, grams), **capacity** (full, grams). One type ("Standard") is seeded by default and pre-selected — logging a bucket normally requires no size entry at all. Admins can add more types if containers/sizes ever vary.

### 6.2 Log a color / bucket (tech)
Log a **PMS code** + name (bucket name = the PMS color), its **bin location**, and its **bucket type** (defaults to "Standard"). **Duplicate-PMS warning** if the code already exists.

### 6.3 Multi-bucket approval
One bucket per color by default. An extra bucket for big jobs requires a **4-digit approval code** (editable in Settings); who approved and when is recorded.

### 6.4 Ink levels — tracked by weight
- **Mixing/adding:** operator enters **grams added**, per the shop's Ink Mixing System (unchanged, stays manual/exact).
- **Usage — by weighing:** at put-away, the operator **weighs the bucket and enters the reading**. The app computes `ink in bucket = measured weight − tare` and `% remaining = ink ÷ capacity`, self-correcting drift automatically — no manual "grams used" entry.
- Level is maintained **per bucket** and summed **per PMS color**.

### 6.5 Bucket fullness status
% remaining maps to **Full / Medium / Low / Empty** via Settings-configurable thresholds (starting point: Full ≥70%, Medium 30–70%, Low 10–30%, Empty <10%).

### 6.6 Freshness & usage
Each color tracks **created** and **last-used** dates; a **freshness warning** fires past an age threshold (default **12 months**, editable).

---

## 7. Settings (admin)
- **Bucket Types** — name, tare weight, capacity (one "Standard" by default).
- **Bucket fullness thresholds** — % cutoffs for Full/Medium/Low/Empty.
- **Multi-bucket approval code** (4-digit, hashed, editable).
- **Ink freshness threshold** — default 12 months.
- **SR wash staleness threshold** (applies to **permanent** SRs) — default 12 months.
- **Max SRs per screen** — no limit.
- **Unit of measure** — grams.

## 8. Analytics (tech console)

**Screens:**
- **Due for Wash (priority, explicit list):** shows the actual **reference #'s (SR codes)** currently due to be washed -- not just a count. For each: **SR code**, **which screen and shelf/location it's on**, **why it's due** (returned one-off / stale permanent / manually requested), **SR type**, **last-used date**, and **use count**. This is the actionable list a tech works from to go pull and wash screens.
- **SR Usage & Retirement Report (new):** every SR (permanent and one-off) with **first-used date, total use count, and last-used date**, so management can spot rarely-used designs and retire them manually even before staleness would flag them.
- **Washed (unassigned) SRs:** valid SRs not currently on a screen — re-shootable pool, distinct from decommissioned.
- **Cart capacity:** per cart and total — shelves available vs. occupied, and total screens assigned per cart.
- Counts: on floor, in production.

**Colors & Ink:**
- **Bucket fullness** (Full/Medium/Low/Empty) from weighed levels.
- **Ink level per PMS color** (% remaining); needs-refill/low/empty list.
- **Most-used ink** (by grams mixed) → proactive ordering.
- **Freshness warnings**; last-used and created per color.

All computed from live data.

## 9. Barcode scanning
USB **keyboard-wedge** guns (barcode + Enter into the focused field). "Scan a shelf/bin" = focused input + lookup by `barcode`. No camera.

## 10. Visual reference
Match `screen-locator-prototype-v6-final.html`: Bricolage Grotesque + Inter; CMYK palette; registration-mark motif; **squeegee wipe** on Screens, **paint splash** on Paint; living background; honor `prefers-reduced-motion`.

## 11. Stack
Match the Package Help Desk repo (detect from its files). If greenfield: **Next.js (React) + PostgreSQL** (e.g., Supabase for DB + auth + hosting).

## 12. Definition of done
1. Tech logs a cart (name/code + slot count) → barcoded shelves generated.
2. Tech logs a screen (Screen # → SR loop, **each SR tagged permanent or one-off** → scan shelf); SR has manual first-shot date, last-used, use-count.
3. Operator checks out by SR# (updates use-count/last-used, blocks conflicts) and returns by scanning a shelf.
4. **One-off SRs auto-queue for wash on return**; **permanent SRs** queue when stale (default 12 months) or when a tech manually requests it at any time.
5. Washing: screen pulled, chosen SR washed and detached, tagged **washed** (re-shootable) or **decommissioned** (retired); siblings stay active; append-only.
6. **Damaged screen:** decommission + re-assign SRs (either type) to a new screen, history and type preserved.
7. **SR Usage & Retirement Report** shows first-used, use-count, last-used per SR for manual retirement decisions.
8. **Bucket Types** (tare + capacity) in Settings, one "Standard" type by default; Paint logs PMS (+dup warning) with a bucket type; multi-bucket needs the 4-digit code; usage tracked by **weighing at put-away** (no manual "grams used"); mixing stays manual grams-added.
9. Analytics: **Due for Wash list showing actual SR codes** (with screen/location and reason), SR usage/retirement report, bucket fullness, ink levels, most-used ink, freshness, cart capacity + screens assigned per cart.
10. Settings: bucket types, fullness thresholds, approval code (hashed), freshness & wash thresholds, max SRs.
11. Sticky role-aware top nav; instant switching; visuals match `v6-final`.

## 13. Confirmed settings (all editable by management)
- **Max SRs per screen:** no limit.
- **SR wash staleness (permanent SRs):** 12 months.
- **Ink freshness warning:** 12 months.
- **Unit of measure:** grams.
- **Bucket container:** one standard type today; more can be added.

## 14. Open questions
- **SR type at logging:** should there be a **default** (e.g., default to Permanent unless marked One-off), or must the tech explicitly choose every time with no default? Current spec assumes an explicit, required choice.
- **One-off auto-wash:** should washing happen **fully automatically** on return, or should it just **queue** the SR and still require a tech to perform the actual wash step (pull screen, wash, tag)? Current spec assumes the latter (auto-queue, tech-performed wash) to keep a human confirming physical wash actions.
- Bucket fullness % thresholds (70/30/10 proposed) — confirm or adjust.

## 15. Out of scope (v1)
Responsive bottom-nav; camera scanning; multi-warehouse; deep Package Help Desk changes.
