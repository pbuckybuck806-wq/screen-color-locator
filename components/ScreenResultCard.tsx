"use client";

import { useState } from "react";
import { RegMark } from "@/components/IconSymbols";
import { ApprovalDeletePrompt } from "@/components/ApprovalDeletePrompt";
import type { ScreenSearchResult, SrRow } from "@/lib/types";

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
  isAdmin,
  onCheckout,
  onWashSr,
  onRequestWash,
  onDeleteSr,
}: {
  sr: SrRow;
  screenBusy: boolean;
  isTech: boolean;
  isAdmin: boolean;
  onCheckout: (srId: number) => void;
  onWashSr: (srId: number, tag: "washed" | "decommissioned", destinationShelf: string, reason?: string) => void;
  onRequestWash: (srId: number) => void;
  onDeleteSr: (srId: number, approvalCode: string) => void;
}) {
  const [washing, setWashing] = useState(false);
  const [reason, setReason] = useState("");
  const [destShelf, setDestShelf] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return (
      <div style={{ marginLeft: "auto" }}>
        <ApprovalDeletePrompt confirmLabel="Confirm delete reference" busy={screenBusy} onConfirm={(code) => onDeleteSr(sr.id, code)} onCancel={() => setDeleting(false)} />
      </div>
    );
  }

  if (washing) {
    const canSubmit = destShelf.trim().length > 0;
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
        <input
          autoFocus
          placeholder="Destination shelf (required)"
          value={destShelf}
          onChange={(e) => setDestShelf(e.target.value)}
          style={{ background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 8, color: "var(--paper)", padding: "6px 10px", fontSize: 12.5, width: 170 }}
        />
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 10px", fontSize: 12.5, width: 150 }}
        />
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={screenBusy || !canSubmit} onClick={() => onWashSr(sr.id, "washed", destShelf.trim(), reason)}>
          Tag washed
        </button>
        <button
          className="btn-ghost"
          style={{ padding: "6px 12px", fontSize: 12.5 }}
          disabled={screenBusy || !canSubmit}
          onClick={() => onWashSr(sr.id, "decommissioned", destShelf.trim(), reason)}
        >
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
      {isAdmin && (
        <button
          className="btn-ghost"
          style={{ padding: "6px 12px", fontSize: 12.5, borderColor: "var(--magenta)", color: "var(--magenta)" }}
          disabled={screenBusy}
          onClick={() => setDeleting(true)}
        >
          Delete
        </button>
      )}
    </div>
  );
}

export function ScreenResultCard({
  result,
  isTech,
  isAdmin,
  onCheckout,
  onReturn,
  onWashSr,
  onRequestWash,
  onDeleteSr,
  onDeleteScreen,
  onMoveShelf,
  busy,
}: {
  result: ScreenSearchResult;
  isTech: boolean;
  isAdmin: boolean;
  onCheckout: (srId: number) => void;
  onReturn: (barcode: string) => void;
  onWashSr: (srId: number, tag: "washed" | "decommissioned", destinationShelf: string, reason?: string) => void;
  onRequestWash: (srId: number) => void;
  onDeleteSr: (srId: number, approvalCode: string) => void;
  onDeleteScreen: (approvalCode: string) => void;
  onMoveShelf: (barcode: string) => void;
  busy: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [deletingScreen, setDeletingScreen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveValue, setMoveValue] = useState("");

  const cardClass = result.status === "in_production" ? "prod" : "avail";
  const tagLabel = result.status === "in_production" ? "● In production" : "● On shelf";
  const runningSr = result.srs.find((s) => s.checkedOut);

  function submitScan() {
    if (!scanValue.trim()) return;
    onReturn(scanValue.trim());
    setScanValue("");
    setScanning(false);
  }

  function submitMove() {
    if (!moveValue.trim()) return;
    onMoveShelf(moveValue.trim());
    setMoveValue("");
    setMoving(false);
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
              <span className="rcode code">{sr.code}</span>
              {sr.differentiator && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, background: "var(--line-2)", color: "var(--paper)" }}>
                  {sr.differentiator}
                </span>
              )}
              <span className="design" style={{ fontSize: 11 }}>
                {sr.srType === "permanent" ? "Permanent" : "One-off"}
              </span>
              <span className="design">{sr.design}</span>
              <span className="design" style={{ fontSize: 12 }}>
                {sr.useCount}× · {formatDate(sr.lastUsedAt)}
              </span>
              {sr.dueForWash && sr.washReason && <span className="rstate wait">{WASH_REASON_LABEL[sr.washReason]}</span>}
              <SrRowActions
                sr={sr}
                screenBusy={busy}
                isTech={isTech}
                isAdmin={isAdmin}
                onCheckout={onCheckout}
                onWashSr={onWashSr}
                onRequestWash={onRequestWash}
                onDeleteSr={onDeleteSr}
              />
            </div>
          ))}
        </div>
      </div>

      {result.status === "in_production" && runningSr && (
        <div className="note-banner inuse">
          <RegMark style={{ color: "var(--magenta)", width: 20, height: 20 }} />
          <span>
            <b className="mag">Checked out.</b> Running <b>{runningSr.code}</b>.{" "}
            {result.shelf ? (
              <>
                Return to <b>Shelf {result.shelf}</b> when done.
              </>
            ) : (
              "It'll free up when returned."
            )}
          </span>
        </div>
      )}

      <div className="rc-actions">
        {scanning ? (
          <input
            autoFocus
            className="code"
            style={{ background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 14 }}
            placeholder="Scan or type shelf ID…  e.g. B1 or SHLF-B-01"
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

      {isTech && (
        <div className="rc-actions" style={{ marginTop: 10 }}>
          {moving ? (
            <input
              autoFocus
              className="code"
              style={{ background: "var(--k)", border: "1px solid var(--line-2)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 14 }}
              placeholder="Scan or type shelf ID to move it to…"
              value={moveValue}
              onChange={(e) => setMoveValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitMove()}
              onBlur={() => !moveValue && setMoving(false)}
            />
          ) : (
            <button className="btn-ghost" onClick={() => setMoving(true)} disabled={busy}>
              Move to a different shelf
            </button>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="rc-actions" style={{ marginTop: 10 }}>
          {deletingScreen ? (
            <ApprovalDeletePrompt confirmLabel="Confirm delete screen" busy={busy} onConfirm={onDeleteScreen} onCancel={() => setDeletingScreen(false)} />
          ) : (
            <button
              className="btn-ghost"
              style={{ borderColor: "var(--magenta)", color: "var(--magenta)" }}
              disabled={busy}
              onClick={() => setDeletingScreen(true)}
            >
              Delete this screen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
