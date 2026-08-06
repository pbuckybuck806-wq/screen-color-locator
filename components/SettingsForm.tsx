"use client";

import { useState } from "react";
import { updateSettings, upsertBucketType } from "@/lib/actions/settings";
import { showToast } from "@/lib/toast";
import type { BucketType, SettingsData } from "@/lib/types";

const inputStyle: React.CSSProperties = { width: "100%", background: "var(--k)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 15 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--mist)", margin: "18px 0 8px" };

function BucketTypesCard({ initial }: { initial: BucketType[] }) {
  const [types, setTypes] = useState(initial);
  const [name, setName] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isDefault, setIsDefault] = useState(types.length === 0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  function editType(t: BucketType) {
    setEditingId(t.id);
    setName(t.name);
    setTareWeight(String(t.tareWeight));
    setCapacity(String(t.capacity));
    setIsDefault(t.isDefault);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setTareWeight("");
    setCapacity("");
    setIsDefault(false);
  }

  async function save() {
    if (!name.trim()) return showToast("Enter a bucket type name.");
    const tare = Number(tareWeight);
    const cap = Number(capacity);
    if (!(tare >= 0) || !(cap > 0)) return showToast("Enter a valid tare weight and capacity.");

    setBusy(true);
    const res = await upsertBucketType({ id: editingId ?? undefined, name, tareWeight: tare, capacity: cap, isDefault });
    setBusy(false);
    if (!res.ok) return showToast(res.error);

    setTypes((prev) => {
      const next = isDefault ? prev.map((t) => ({ ...t, isDefault: false })) : prev;
      const row: BucketType = { id: res.data.id, name: name.trim(), tareWeight: tare, capacity: cap, isDefault };
      const exists = next.some((t) => t.id === row.id);
      return exists ? next.map((t) => (t.id === row.id ? row : t)) : [...next, row];
    });
    showToast(editingId ? "Bucket type updated." : "Bucket type added.");
    resetForm();
  }

  return (
    <div className="result-card avail" style={{ marginTop: 20 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--mist)" }}>
        Full weight = tare + capacity (derived, not stored). Logging a color pre-selects the default type.
      </p>

      <div className="ref-list" style={{ margin: "16px 0" }}>
        {types.map((t) => (
          <div className="ref-row" key={t.id}>
            <span className="rcode code">{t.name}</span>
            <span className="design">
              tare {t.tareWeight}g · holds {t.capacity}g
            </span>
            {t.isDefault && <span className="rstate done">Default</span>}
            <button className="btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={() => editType(t)}>
              Edit
            </button>
          </div>
        ))}
        {types.length === 0 && <p style={{ color: "var(--mist)", fontSize: 13.5 }}>No bucket types yet — add one below.</p>}
      </div>

      <label style={labelStyle}>{editingId ? "Edit bucket type" : "Add a bucket type"}</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle, flex: "2 1 140px" }} placeholder="Name, e.g. Standard" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" style={{ ...inputStyle, flex: "1 1 100px" }} placeholder="Tare (g)" value={tareWeight} onChange={(e) => setTareWeight(e.target.value)} />
        <input type="number" style={{ ...inputStyle, flex: "1 1 100px" }} placeholder="Capacity (g)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5, color: "var(--mist)" }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Default type (pre-selected when logging a color)
      </label>
      <div className="rc-actions">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {editingId ? "Save changes" : "Add bucket type"}
        </button>
        {editingId && (
          <button className="btn-ghost" onClick={resetForm}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: SettingsData }) {
  const [unit, setUnit] = useState(initial.unit);
  const [inkFreshnessMonths, setInkFreshnessMonths] = useState(String(initial.inkFreshnessMonths));
  const [washStaleMonths, setWashStaleMonths] = useState(String(initial.screenWashStaleMonths));
  const [maxSrPerScreen, setMaxSrPerScreen] = useState(initial.maxSrPerScreen != null ? String(initial.maxSrPerScreen) : "");
  const [fullnessFullPct, setFullnessFullPct] = useState(String(initial.fullnessFullPct));
  const [fullnessMediumPct, setFullnessMediumPct] = useState(String(initial.fullnessMediumPct));
  const [fullnessEmptyPct, setFullnessEmptyPct] = useState(String(initial.fullnessEmptyPct));
  const [newApprovalCode, setNewApprovalCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (newApprovalCode && !/^\d{4}$/.test(newApprovalCode)) return showToast("Approval code must be exactly 4 digits.");
    setBusy(true);
    const res = await updateSettings({
      unit: unit || "g",
      inkFreshnessMonths: Number(inkFreshnessMonths) || 12,
      screenWashStaleMonths: Number(washStaleMonths) || 12,
      maxSrPerScreen: maxSrPerScreen ? Number(maxSrPerScreen) : null,
      fullnessFullPct: Number(fullnessFullPct) || 70,
      fullnessMediumPct: Number(fullnessMediumPct) || 30,
      fullnessEmptyPct: Number(fullnessEmptyPct) || 10,
      newApprovalCode: newApprovalCode || undefined,
    });
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setNewApprovalCode("");
    showToast("Settings saved.");
  }

  return (
    <>
      <div className="result-card avail">
        <label style={{ ...labelStyle, marginTop: 0 }}>Unit of measure</label>
        <input style={{ ...inputStyle, maxWidth: 120 }} value={unit} onChange={(e) => setUnit(e.target.value)} />

        <label style={labelStyle}>Ink freshness threshold (months)</label>
        <input type="number" style={inputStyle} value={inkFreshnessMonths} onChange={(e) => setInkFreshnessMonths(e.target.value)} />

        <label style={labelStyle}>SR wash staleness threshold (months)</label>
        <input type="number" style={inputStyle} value={washStaleMonths} onChange={(e) => setWashStaleMonths(e.target.value)} />

        <label style={labelStyle}>Max SRs per screen (blank = no limit)</label>
        <input type="number" style={inputStyle} placeholder="No limit" value={maxSrPerScreen} onChange={(e) => setMaxSrPerScreen(e.target.value)} />

        <label style={labelStyle}>Bucket fullness thresholds (% remaining)</label>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: "var(--mist)" }}>Full ≥</span>
            <input type="number" style={inputStyle} value={fullnessFullPct} onChange={(e) => setFullnessFullPct(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: "var(--mist)" }}>Medium ≥</span>
            <input type="number" style={inputStyle} value={fullnessMediumPct} onChange={(e) => setFullnessMediumPct(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: "var(--mist)" }}>Empty &lt;</span>
            <input type="number" style={inputStyle} value={fullnessEmptyPct} onChange={(e) => setFullnessEmptyPct(e.target.value)} />
          </div>
        </div>

        <label style={labelStyle}>
          Multi-bucket approval code {initial.hasApprovalCode && <span style={{ color: "var(--good)", textTransform: "none", fontWeight: 400 }}>(currently set)</span>}
        </label>
        <input style={inputStyle} placeholder="New 4-digit code" maxLength={4} value={newApprovalCode} onChange={(e) => setNewApprovalCode(e.target.value)} />

        <div className="rc-actions">
          <button className="btn-primary" onClick={save} disabled={busy}>
            Save settings
          </button>
        </div>
      </div>

      <h4 style={{ margin: "28px 0 4px", fontFamily: "var(--font-display)" }}>Bucket types</h4>
      <BucketTypesCard initial={initial.bucketTypes} />
    </>
  );
}
