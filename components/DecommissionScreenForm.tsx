"use client";

import { useState } from "react";
import { lookupScreenByNumber, decommissionAndReassignScreen } from "@/lib/actions/screens";
import { showToast } from "@/lib/toast";
import type { ScreenSearchResult } from "@/lib/types";

export function DecommissionScreenForm() {
  const [damagedNumber, setDamagedNumber] = useState("");
  const [damagedScreen, setDamagedScreen] = useState<ScreenSearchResult | null>(null);
  const [targetNumber, setTargetNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function lookup() {
    const num = Number(damagedNumber);
    if (!num) return;
    setBusy(true);
    const result = await lookupScreenByNumber(num);
    setBusy(false);
    if (!result) return showToast("No active screen with that number.");
    setDamagedScreen(result);
  }

  async function submit() {
    const damaged = Number(damagedNumber);
    const target = Number(targetNumber);
    if (!damaged || !target) return showToast("Enter both screen numbers.");
    setBusy(true);
    const res = await decommissionAndReassignScreen(damaged, target);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setDone(`Screen #${damaged} decommissioned. ${res.data.movedCount} reference(s) moved to #${target}.`);
  }

  function reset() {
    setDamagedNumber("");
    setDamagedScreen(null);
    setTargetNumber("");
    setDone(null);
  }

  if (done) {
    return (
      <div className="result-card avail">
        <p style={{ margin: 0, fontSize: 15 }}>{done}</p>
        <div className="rc-actions">
          <button className="btn-primary" onClick={reset}>
            Decommission another
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { flex: 1, background: "var(--k)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--mist)", marginBottom: 8 };

  return (
    <div className="result-card avail">
      <label style={labelStyle}>Damaged screen number</label>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input className="code" style={inputStyle} placeholder="e.g. 218" value={damagedNumber} onChange={(e) => setDamagedNumber(e.target.value)} />
        <button className="btn-ghost" onClick={lookup} disabled={busy}>
          Look up
        </button>
      </div>

      {damagedScreen && (
        <div className="rc-refs" style={{ marginBottom: 20 }}>
          <div className="cap">Active references on screen #{damagedScreen.screen}</div>
          <div className="ref-list">
            {damagedScreen.srs.length === 0 && <p style={{ color: "var(--mist)", fontSize: 13.5 }}>No active references — nothing to move.</p>}
            {damagedScreen.srs.map((sr) => (
              <div className="ref-row" key={sr.id}>
                <span className="rcode code">{sr.code}</span>
                <span className="design">{sr.design}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <label style={labelStyle}>Target screen number (existing or new)</label>
      <input className="code" style={{ ...inputStyle, width: "100%", marginBottom: 20 }} placeholder="e.g. 219" value={targetNumber} onChange={(e) => setTargetNumber(e.target.value)} />

      <div className="rc-actions">
        <button className="btn-primary" onClick={submit} disabled={busy || !damagedScreen}>
          Decommission &amp; reassign
        </button>
      </div>
    </div>
  );
}
