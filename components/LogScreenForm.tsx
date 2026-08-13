"use client";

import { useRef, useState } from "react";
import { logScreen, placeScreenByBarcode } from "@/lib/actions/screens";
import { showToast } from "@/lib/toast";
import type { SrType } from "@/lib/types";

type SrDraft = { srCode: string; srType: SrType | ""; designName: string; channel: string; firstShotAt: string };

const CHANNELS = ["", "cyan", "magenta", "yellow", "black"];

function emptySr(): SrDraft {
  return { srCode: "", srType: "", designName: "", channel: "", firstShotAt: "" };
}

export function LogScreenForm() {
  const [step, setStep] = useState<"details" | "place" | "done">("details");
  const [screenNumber, setScreenNumber] = useState("");
  const [srs, setSrs] = useState<SrDraft[]>([emptySr()]);
  const [busy, setBusy] = useState(false);
  const [screenId, setScreenId] = useState<number | null>(null);
  const [barcode, setBarcode] = useState("");
  const [placedShelf, setPlacedShelf] = useState("");
  const srCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  function updateSr(i: number, patch: Partial<SrDraft>) {
    setSrs((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Scanners are keyboard-wedge devices — they type the code, then an Enter.
  // Adding + focusing the next row here means a tech can keep scanning SR
  // codes back-to-back with no mouse/Tab needed, matching how shelf-barcode
  // scanning already works elsewhere in the app.
  function addRow() {
    const newIndex = srs.length;
    setSrs((rs) => [...rs, emptySr()]);
    requestAnimationFrame(() => srCodeRefs.current[newIndex]?.focus());
  }

  async function submitDetails() {
    const num = Number(screenNumber);
    if (!num || num < 1 || num > 900) return showToast("Enter a screen number between 1 and 900.");
    const cleanSrs = srs.filter((r) => r.srCode.trim());
    if (cleanSrs.length === 0) return showToast("Enter at least one separation reference.");
    if (cleanSrs.some((r) => !r.srType)) return showToast("Choose Permanent or One-off for every reference.");

    setBusy(true);
    const res = await logScreen(
      num,
      cleanSrs.map((r) => ({
        srCode: r.srCode,
        srType: r.srType as SrType,
        designName: r.designName || undefined,
        channel: r.channel || undefined,
        firstShotAt: r.firstShotAt ? new Date(r.firstShotAt).toISOString() : undefined,
      })),
    );
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setScreenId(res.data.screenId);
    setStep("place");
  }

  async function submitPlacement() {
    if (!screenId || !barcode.trim()) return;
    setBusy(true);
    const res = await placeScreenByBarcode(screenId, barcode.trim());
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setPlacedShelf(barcode.trim());
    setStep("done");
  }

  function reset() {
    setStep("details");
    setScreenNumber("");
    setSrs([emptySr()]);
    setScreenId(null);
    setBarcode("");
    setPlacedShelf("");
  }

  if (step === "done") {
    return (
      <div className="result-card avail">
        <p style={{ margin: 0, fontSize: 15 }}>
          Screen <b className="code">#{screenNumber}</b> logged and placed via shelf barcode <b className="code">{placedShelf}</b>.
        </p>
        <div className="rc-actions">
          <button className="btn-primary" onClick={reset}>
            Log another screen
          </button>
        </div>
      </div>
    );
  }

  if (step === "place") {
    return (
      <div className="result-card avail">
        <p style={{ margin: "0 0 16px", fontSize: 15 }}>
          Screen <b className="code">#{screenNumber}</b> logged. Scan the shelf barcode to place it.
        </p>
        <input
          autoFocus
          className="code"
          style={{ width: "100%", background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 14 }}
          placeholder="Scan or type shelf ID…  e.g. B1 or SHLF-B-01"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitPlacement()}
        />
        <div className="rc-actions">
          <button className="btn-primary" onClick={submitPlacement} disabled={busy}>
            Place screen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="result-card avail">
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--mist)", marginBottom: 8 }}>
        Screen number
      </label>
      <input
        className="code"
        style={{ width: "100%", background: "var(--k)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 16, marginBottom: 20 }}
        placeholder="e.g. 218"
        value={screenNumber}
        onChange={(e) => setScreenNumber(e.target.value)}
      />

      <div className="cap" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--mist)", textTransform: "uppercase", marginBottom: 12 }}>
        Separation references
      </div>
      <div className="ref-list" style={{ marginBottom: 16 }}>
        {srs.map((r, i) => (
          <div className="ref-row" key={i} style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              ref={(el) => {
                srCodeRefs.current[i] = el;
              }}
              placeholder="SR code, e.g. SR-4521"
              value={r.srCode}
              onChange={(e) => updateSr(i, { srCode: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && r.srCode.trim()) addRow();
              }}
              style={{ background: "transparent", border: "none", color: "var(--paper)", fontWeight: 600, flex: "1 1 140px" }}
            />
            <input
              placeholder="Design name"
              value={r.designName}
              onChange={(e) => updateSr(i, { designName: e.target.value })}
              style={{ background: "transparent", border: "none", color: "var(--mist)", flex: "1 1 140px" }}
            />
            <select
              value={r.channel}
              onChange={(e) => updateSr(i, { channel: e.target.value })}
              style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 8px" }}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c || "channel"}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--mist)" }}>
              First shot
              <input
                type="date"
                value={r.firstShotAt}
                onChange={(e) => updateSr(i, { firstShotAt: e.target.value })}
                style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 8px", fontSize: 12.5 }}
              />
            </label>
            <div className="mark-btns" style={{ width: "100%" }}>
              <button
                type="button"
                className={r.srType === "permanent" ? "active-available" : ""}
                onClick={() => updateSr(i, { srType: "permanent" })}
                style={{ padding: "8px 14px", fontSize: 12.5 }}
              >
                Permanent
              </button>
              <button
                type="button"
                className={r.srType === "one_off" ? "active-in_use" : ""}
                onClick={() => updateSr(i, { srType: "one_off" })}
                style={{ padding: "8px 14px", fontSize: 12.5 }}
              >
                One-off
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rc-actions">
        <button className="btn-ghost" onClick={addRow}>
          + Add another reference
        </button>
        <button className="btn-primary" onClick={submitDetails} disabled={busy}>
          Save &amp; continue to placement
        </button>
      </div>
    </div>
  );
}
