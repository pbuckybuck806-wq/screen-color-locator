"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getColorsDashboard, type ColorsDashboard, type ScreensDashboard } from "@/lib/actions/analytics";

function formatDate(iso: string | null) {
  if (!iso) return "never used";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const WASH_REASON_LABEL: Record<string, string> = {
  one_off_returned: "one-off returned",
  manual_request: "requested",
  stale_permanent: "stale",
};
const SR_TYPE_LABEL: Record<string, string> = { permanent: "Permanent", one_off: "One-off" };

export function AnalyticsDashboards({
  profileName,
  profileRole,
  initialScreens,
}: {
  profileName: string;
  profileRole: string;
  initialScreens: ScreensDashboard;
}) {
  const [dash, setDash] = useState<"screens" | "colors">("screens");
  const [screens] = useState(initialScreens);
  const [colors, setColors] = useState<ColorsDashboard | null>(null);
  const [barsIn, setBarsIn] = useState(false);
  const [showInProduction, setShowInProduction] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBarsIn(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (dash === "colors" && !colors) {
      getColorsDashboard().then(setColors);
    }
  }, [dash, colors]);

  const initials = profileName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="wrap">
      <div className="an-head">
        <div>
          <p className="eyebrow">Tech Console · Signed In</p>
          <h1 className="title">Floor analytics</h1>
        </div>
        <div className="an-user">
          <span className="av">{initials}</span>
          {profileName} · {profileRole}
        </div>
      </div>

      <div className="seg" style={{ margin: "0 0 24px" }}>
        <button className={dash === "screens" ? "on" : ""} onClick={() => setDash("screens")}>
          Screens
        </button>
        <button className={dash === "colors" ? "on" : ""} onClick={() => setDash("colors")}>
          Colors &amp; Ink
        </button>
      </div>

      <div className={`an-dash${dash === "screens" ? " on" : ""}`}>
        <div className="stat-grid">
          <div className="stat">
            <div className="bar-accent" style={{ background: "var(--orange)" }} />
            <div className="cap">On the floor</div>
            <div className="v">{screens.onFloor}</div>
            <div className="sub">on shelf right now</div>
          </div>
          <div className="stat clickable" onClick={() => setShowInProduction((v) => !v)}>
            <div className="bar-accent" style={{ background: "var(--magenta)" }} />
            <div className="cap">In production</div>
            <div className="v">{screens.inProduction}</div>
            <div className="sub">checked out to jobs · {showInProduction ? "hide list ▲" : "click to view ▼"}</div>
          </div>
          <div className="stat">
            <div className="bar-accent" style={{ background: "var(--yellow)" }} />
            <div className="cap">Due for wash</div>
            <div className="v">{screens.washQueue.length}</div>
            <div className="sub">returned one-offs, stale, or requested</div>
          </div>
          <div className="stat">
            <div className="bar-accent" style={{ background: "var(--good)" }} />
            <div className="cap">Never used</div>
            <div className="v">{screens.neverUsedCount}</div>
            <div className="sub">logged, not yet run</div>
          </div>
        </div>

        {showInProduction && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Checked out to production</h4>
            <p className="sub">SR, screen, and the shelf it was taken from</p>
            <div className="wash-list">
              {screens.inProductionList.length === 0 && <div className="empty-good">✓ Nothing checked out right now.</div>}
              {screens.inProductionList.map((r) => (
                <div className="wash-item" key={r.srId}>
                  <span className="rcode code">
                    {r.srCode}
                    {r.differentiator ? ` · ${r.differentiator}` : ""}
                  </span>
                  <span className="design">
                    Screen #{r.screenNumber}
                    {r.cartCode ? ` · from Cart ${r.cartCode} · Shelf ${r.shelfCode}` : " · not on a shelf"}
                  </span>
                  <span className="cyc" style={{ color: "var(--magenta)" }}>
                    since {formatDate(r.checkedOutAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="an-cols">
          <div className="card">
            <h4>Due for wash</h4>
            <p className="sub">The actual list to pull and wash from — SR, location, and why</p>
            <div className="wash-list">
              {screens.washQueue.length === 0 && <div className="empty-good">✓ Nothing due for wash.</div>}
              {screens.washQueue.map((r) => (
                <div className="wash-item" key={r.srId}>
                  <span className="rcode code">
                    {r.srCode}
                    {r.differentiator ? ` · ${r.differentiator}` : ""}
                  </span>
                  <span className="design">
                    Screen #{r.screenNumber}
                    {r.cartCode ? ` · Cart ${r.cartCode} · Shelf ${r.shelfCode}` : " · not on a shelf"} · {SR_TYPE_LABEL[r.srType]} ·{" "}
                    {r.useCount}× · {formatDate(r.lastUsedAt)}
                  </span>
                  <span className="cyc" style={{ color: "var(--yellow)" }}>
                    {WASH_REASON_LABEL[r.reason]}
                  </span>
                </div>
              ))}
            </div>
            {screens.fullyReclaimableScreens.length > 0 && (
              <>
                <h4 style={{ marginTop: 24 }}>Fully reclaimable screens</h4>
                <p className="sub">Every active SR is due for wash</p>
                <div className="wash-list">
                  {screens.fullyReclaimableScreens.map((s) => (
                    <div className="wash-item" key={s.screenNumber}>
                      <span className="rcode code">Screen #{s.screenNumber}</span>
                      <span className="cyc">{s.dueCount} due</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h4>Cart capacity</h4>
            <p className="sub">Shelves occupied per cart</p>
            <div className="cart-grid">
              {screens.cartCapacity.map((c) => {
                const pct = c.shelfCount > 0 ? Math.round((c.occupied / c.shelfCount) * 100) : 0;
                return (
                  <div className="cart-cell" key={c.code} title={`Cart ${c.code}: ${c.occupied}/${c.shelfCount} occupied`}>
                    <div className="fill" style={{ height: barsIn ? `${pct}%` : "0%" }} />
                    <span>{c.code}</span>
                  </div>
                );
              })}
            </div>
            <div className="cart-legend">
              <span>Empty</span>
              <div className="grad" />
              <span>Full</span>
            </div>
          </div>
        </div>

        <div className="an-cols" style={{ marginTop: 16 }}>
          <div className="card">
            <h4>Washed, unassigned pool</h4>
            <p className="sub">Valid SRs not currently on a screen — available to re-shoot</p>
            <div className="wash-list">
              {screens.washedPool.length === 0 && <div className="empty-good">✓ Nothing waiting to be re-shot.</div>}
              {screens.washedPool.map((r) => (
                <div className="wash-item" key={r.srId}>
                  <span className="rcode code">
                    {r.srCode}
                    {r.differentiator ? ` · ${r.differentiator}` : ""}
                  </span>
                  <span className="design">
                    {r.design} · {r.useCount}× · washed {formatDate(r.washedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ display: "flex", flexDirection: "column" }}>
            <h4>SR usage &amp; retirement report</h4>
            <p className="sub">Least-used, oldest first — candidates to retire manually</p>
            <div style={{ marginTop: "auto", paddingTop: 16 }}>
              <div className="v" style={{ fontSize: 32 }}>
                {screens.retirementReportCount}
              </div>
              <div className="sub" style={{ marginBottom: 14 }}>
                active SRs tracked
              </div>
              <Link href="/analytics/retirement-report" className="btn-ghost" style={{ display: "inline-block" }}>
                View full report →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className={`an-dash${dash === "colors" ? " on" : ""}`}>
        {!colors ? (
          <p style={{ color: "var(--mist)" }}>Loading…</p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="bar-accent" style={{ background: "var(--cyan)" }} />
                <div className="cap">Colors logged</div>
                <div className="v">{colors.colorsLogged}</div>
                <div className="sub">distinct PMS codes</div>
              </div>
              <div className="stat">
                <div className="bar-accent" style={{ background: "var(--yellow)" }} />
                <div className="cap">Low</div>
                <div className="v">{colors.fullnessCounts.low}</div>
                <div className="sub">below the Low threshold</div>
              </div>
              <div className="stat">
                <div className="bar-accent" style={{ background: "var(--orange)" }} />
                <div className="cap">Empty</div>
                <div className="v">{colors.fullnessCounts.empty}</div>
                <div className="sub">needs refill</div>
              </div>
              <div className="stat">
                <div className="bar-accent" style={{ background: "var(--yellow)" }} />
                <div className="cap">Freshness warnings</div>
                <div className="v">{colors.freshnessWarnings.length}</div>
                <div className="sub">aged past threshold</div>
              </div>
            </div>
            <div className="an-cols">
              <div className="card">
                <h4>Ink level per color</h4>
                <p className="sub">Current amount vs. capacity</p>
                {colors.inkLevels.map((c) => (
                  <div className="chan-row" key={c.pmsCode}>
                    <span className="name">{c.name}</span>
                    <div className="track">
                      <div
                        className="val"
                        style={{
                          width: `${c.pctRemaining}%`,
                          background: c.fullness === "empty" ? "var(--orange)" : c.fullness === "low" ? "var(--yellow)" : c.hex,
                        }}
                      />
                    </div>
                    <span className="pct">{c.pctRemaining}%</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <h4>Most-used ink</h4>
                <p className="sub">All-time, by grams added when mixing · proactive ordering</p>
                {colors.mostUsedInks.length === 0 && <div className="empty-good">No mixing history yet.</div>}
                {colors.mostUsedInks.map((m) => (
                  <div className="refill-item" key={m.pmsCode}>
                    <span className="sw" style={{ background: m.hex }} />
                    <div className="ci">
                      <div className="nm">{m.name}</div>
                      <div className="cd code">{m.pmsCode}</div>
                    </div>
                    <div className="loc">{Math.round(m.totalAdded)}g added</div>
                  </div>
                ))}
                <h4 style={{ marginTop: 24 }}>Freshness warnings</h4>
                <div className="refill-list">
                  {colors.freshnessWarnings.length === 0 && <div className="empty-good">✓ Nothing aged past threshold.</div>}
                  {colors.freshnessWarnings.map((f) => (
                    <div className="refill-item" key={f.pmsCode}>
                      <span className="sw" style={{ background: f.hex }} />
                      <div className="ci">
                        <div className="nm">{f.name}</div>
                        <div className="cd code">{f.pmsCode}</div>
                      </div>
                      <div className="loc">{formatDate(f.lastUsedAt ?? f.createdAt)}</div>
                      <span className="flag">Aged</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <p className="footnote">All numbers computed live. Marking a bucket empty in the locator updates this dashboard.</p>
    </div>
  );
}
