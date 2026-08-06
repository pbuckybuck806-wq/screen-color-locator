"use client";

import { useState } from "react";
import { checkPmsExists, logColor, addBucket } from "@/lib/actions/paint";
import { showToast } from "@/lib/toast";
import type { BucketType } from "@/lib/types";

export function LogColorForm({ bucketTypes }: { bucketTypes: BucketType[] }) {
  const defaultTypeId = bucketTypes.find((t) => t.isDefault)?.id ?? bucketTypes[0]?.id;

  const [pmsCode, setPmsCode] = useState("");
  const [name, setName] = useState("");
  const [hex, setHex] = useState("");
  const [rack, setRack] = useState("");
  const [bin, setBin] = useState("");
  const [bucketTypeId, setBucketTypeId] = useState<number | undefined>(defaultTypeId);
  const [approvalCode, setApprovalCode] = useState("");
  const [dup, setDup] = useState<{ exists: boolean; colorId: number | null; bucketCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function checkDup() {
    if (!pmsCode.trim()) return;
    const result = await checkPmsExists(pmsCode);
    setDup(result);
  }

  async function submit() {
    if (!pmsCode.trim() || !rack.trim() || !bin.trim()) return showToast("PMS code, rack, and bin are required.");
    if (!dup?.exists && !name.trim()) return showToast("Enter a color name.");
    setBusy(true);

    if (dup?.exists && dup.colorId) {
      const res = await addBucket({ colorId: dup.colorId, rack, bin, bucketTypeId, approvalCode: approvalCode || undefined });
      setBusy(false);
      if (!res.ok) return showToast(res.error);
      setDone(`Added another bucket for ${pmsCode.toUpperCase()}.`);
    } else {
      const res = await logColor({ pmsCode, name, hex: hex || undefined, rack, bin, bucketTypeId });
      setBusy(false);
      if (!res.ok) return showToast(res.error);
      setDone(`Logged ${pmsCode.toUpperCase()} — ${name}.`);
    }
  }

  function reset() {
    setPmsCode("");
    setName("");
    setHex("");
    setRack("");
    setBin("");
    setBucketTypeId(defaultTypeId);
    setApprovalCode("");
    setDup(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="result-card avail">
        <p style={{ margin: 0, fontSize: 15 }}>{done}</p>
        <div className="rc-actions">
          <button className="btn-primary" onClick={reset}>
            Log another color
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: "100%", background: "var(--k)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 15 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--mist)", margin: "16px 0 8px" };

  return (
    <div className="result-card avail">
      <label style={{ ...labelStyle, marginTop: 0 }}>PMS code</label>
      <input className="code" style={inputStyle} placeholder="e.g. PMS-021" value={pmsCode} onChange={(e) => setPmsCode(e.target.value)} onBlur={checkDup} />

      {dup?.exists && (
        <div className="note-banner wash" style={{ marginTop: 16 }}>
          <span>
            <b className="yel">That PMS code is already logged.</b> This will add another bucket to the existing color
            {dup.bucketCount > 0 ? " — the 4-digit approval code is required." : "."}
          </span>
        </div>
      )}

      {!dup?.exists && (
        <>
          <label style={labelStyle}>Color name</label>
          <input style={inputStyle} placeholder="e.g. Race Red" value={name} onChange={(e) => setName(e.target.value)} />
          <label style={labelStyle}>Hex (optional)</label>
          <input style={inputStyle} placeholder="#E4002B" value={hex} onChange={(e) => setHex(e.target.value)} />
        </>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Rack</label>
          <input style={inputStyle} placeholder="Rack 2" value={rack} onChange={(e) => setRack(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Bin</label>
          <input style={inputStyle} placeholder="Bin C4" value={bin} onChange={(e) => setBin(e.target.value)} />
        </div>
      </div>

      <label style={labelStyle}>Bucket type</label>
      {bucketTypes.length === 0 ? (
        <p style={{ color: "var(--orange)", fontSize: 13.5 }}>No bucket types configured yet — add one in Settings first.</p>
      ) : (
        <select
          value={bucketTypeId ?? ""}
          onChange={(e) => setBucketTypeId(Number(e.target.value))}
          style={{ ...inputStyle, appearance: "auto" }}
        >
          {bucketTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — tare {t.tareWeight}g, holds {t.capacity}g
            </option>
          ))}
        </select>
      )}

      {dup?.exists && dup.bucketCount > 0 && (
        <>
          <label style={labelStyle}>4-digit approval code</label>
          <input style={inputStyle} placeholder="••••" maxLength={4} value={approvalCode} onChange={(e) => setApprovalCode(e.target.value)} />
        </>
      )}

      <div className="rc-actions">
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {dup?.exists ? "Add bucket" : "Log color"}
        </button>
      </div>
    </div>
  );
}
