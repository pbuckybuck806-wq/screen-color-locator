"use client";

import { useState } from "react";
import { RegMark } from "@/components/IconSymbols";
import type { ScreenSearchResult, SrRow } from "@/lib/types";

const CHANNEL_VAR: Record<string, string> = {
  cyan: "var(--cyan)",
  magenta: "var(--magenta)",
  yellow: "var(--yellow)",
  black: "#6b7785",
};

function formatDate(iso: string | null) {
  if (!iso) return "Never used";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const WASH_REASON_LABEL: Record<string, string> = {
  one_off_returned: "Due · one-off returned",
  manual_request: "Due · requested",
  stale_permanent: "Due · stale",
};

function SrRowActions({
  sr,
  screenBusy,
  isTech,
  onCheckout,
  onWashSr,
  onRequestWash,
}: {
  sr: SrRow;
  screenBusy: boolean;
  isTech: boolean;
  onCheckout: (srId: number) => void;
  onWashSr: (srId: number, tag: "washed" | "decommissioned", reason?: string) => void;
  onRequestWash: (srId: number) => void;
}) {
  const [washing, setWashing] = useState(false);
  const [reason, setReason] = useState("");

  if (washing) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 10px", fontSize: 12.5, width: 150 }}
        />
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy} onClick={() => onWashSr(sr.id, "washed", reason)}>
          Tag washed
        </button>
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy} onClick={() => onWashSr(sr.id, "decommissioned", reason)}>
          Tag decommissioned
        </button>
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setWashing(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
      {sr.checkedOut ? (
        <span className="rstate run">Running</span>
      ) : (
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy} onClick={() => onCheckout(sr.id)}>
          Check out
        </button>
      )}
      {isTech && !sr.dueForWash && (
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy} onClick={() => onRequestWash(sr.id)}>
          Queue for wash
        </button>
      )}
      {isTech && (
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy} onClick={() => setWashing(true)}>
          Wash
        </button>
      )}
    </div>
  );
}

export function ScreenResultCard({
  result,
  isTech,
  onCheckout,
  onReturn,
  onWashSr,
  onRequestWash,
  busy,
}: {
  result: ScreenSearchResult;
  isTech: boolean;
  onCheckout: (srId: number) => void;
  onReturn: (barcode: string) => void;
  onWashSr: (srId: number, tag: "washed" | "decommissioned", reason?: string) => void;
  onRequestWash: (srId: number) => void;
  busy: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanValue, setScanValue] = useState("");

  const cardClass = result.status === "in_production" ? "prod" : "avail";
  const tagLabel = result.status === "in_production" ? "● In production" : "● On shelf";
  const runningSr = result.srs.find((s) => s.checkedOut);

  function submitScan() {
    if (!scanValue.trim()) return;
    onReturn(scanValue.trim());
    setScanValue("");
    setScanning(false);
  }

  return (
    <div className={`result-card ${cardClass}`}>
      <div className="rc-top">
        <div className="rc-screen">
          <div className="lbl">Screen</div>
          <div className="num">
            <small>#</small>
            {result.screen}
          </div>
        </div>
        <div className={`state-tag ${cardClass}`}>{tagLabel}</div>
      </div>

      <div className="rc-location">
        <RegMark style={{ color: "var(--cyan)" }} />
        <div className="loc-text">
          <span className="cap">Location</span>
          <span className="val">
            {result.cart ? <span className="cart">Cart {result.cart}</span> : "Not on a shelf"}
            {result.shelf ? ` · Shelf ${result.shelf}` : ""}
          </span>
        </div>
      </div>

      <div className="rc-refs">
        <div className="cap">Active separation references</div>
        <div className="ref-list">
          {result.srs.length === 0 && <p style={{ color: "var(--mist)", fontSize: 13.5 }}>No active references on this screen.</p>}
          {result.srs.map((sr) => (
            <div className="ref-row" key={sr.id} style={{ flexWrap: "wrap" }}>
              <span className="chan" style={{ background: CHANNEL_VAR[sr.channel ?? ""] ?? "var(--mist-2)" }} />
              <span className="rcode code">{sr.code}</span>
              <span className="design" style={{ fontSize: 11 }}>
                {sr.srType === "permanent" ? "Permanent" : "One-off"}
              </span>
              <span className="design">{sr.design}</span>
              <span className="design" style={{ fontSize: 12 }}>
                {sr.useCount}× · {formatDate(sr.lastUsedAt)}
              </span>
              {sr.dueForWash && sr.washReason && <span className="rstate wait">{WASH_REASON_LABEL[sr.washReason]}</span>}
              <SrRowActions sr={sr} screenBusy={busy} isTech={isTech} onCheckout={onCheckout} onWashSr={onWashSr} onRequestWash={onRequestWash} />
            </div>
          ))}
        </div>
      </div>

      {result.status === "in_production" && runningSr && (
        <div className="note-banner inuse">
          <RegMark style={{ color: "var(--magenta)", width: 20, height: 20 }} />
          <span>
            <b className="mag">Checked out.</b> Running <b>{runningSr.code}</b>. It&apos;ll free up when returned.
          </span>
        </div>
      )}

      <div className="rc-actions">
        {scanning ? (
          <input
            autoFocus
            className="code"
            style={{ background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 14 }}
            placeholder="Scan shelf barcode…"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitScan()}
            onBlur={() => !scanValue && setScanning(false)}
          />
        ) : (
          <button className="btn-ghost" onClick={() => setScanning(true)} disabled={busy}>
            <span className="scan">⛶ Scan shelf</span> to return
          </button>
        )}
      </div>
    </div>
  );
}
