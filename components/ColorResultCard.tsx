"use client";

import { useState } from "react";
import type { BucketFullness, BucketRow, BucketStatus, ColorSearchResult } from "@/lib/types";

const STATUS_LABEL: Record<BucketStatus, string> = { available: "Available", in_use: "In use", empty: "Empty" };
const FULLNESS_LABEL: Record<BucketFullness, string> = { full: "Full", medium: "Medium", low: "Low", empty: "Empty" };
const FULLNESS_COLOR: Record<BucketFullness, string> = { full: "var(--good)", medium: "var(--cyan)", low: "var(--yellow)", empty: "var(--orange)" };

function splashDrops(seed: number) {
  const drops: { size: number; tx: number; ty: number }[] = [];
  let x = seed || 1;
  const rand = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return (x % 10000) / 10000;
  };
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const dist = 55 + rand() * 130;
    drops.push({ size: 6 + rand() * 20, tx: Math.cos(a) * dist, ty: Math.sin(a) * dist });
  }
  return drops;
}

function fieldStyle(): React.CSSProperties {
  return { width: 100, background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 8, color: "var(--paper)", padding: "6px 8px", fontSize: 13 };
}

function AddInkForm({ bucketId, onSubmit, busy }: { bucketId: number; onSubmit: (bucketId: number, grams: number) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [grams, setGrams] = useState("");

  function submit() {
    const value = Number(grams);
    if (!value || value <= 0) return;
    onSubmit(bucketId, value);
    setGrams("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} disabled={busy} onClick={() => setOpen(true)}>
        + Add ink (mixing)
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        type="number"
        min="0"
        placeholder="grams added"
        value={grams}
        onChange={(e) => setGrams(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={fieldStyle()}
      />
      <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} disabled={busy} onClick={submit}>
        Add
      </button>
      <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}

function WeighForm({ bucketId, onSubmit, busy }: { bucketId: number; onSubmit: (bucketId: number, measuredWeight: number) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");

  function submit() {
    const value = Number(weight);
    if (!value || value < 0) return;
    onSubmit(bucketId, value);
    setWeight("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={() => setOpen(true)}>
        ⚖ Weigh bucket (put-away)
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        type="number"
        min="0"
        placeholder="scale reading"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={fieldStyle()}
      />
      <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={submit}>
        Save weight
      </button>
      <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}

function BucketCard({
  bucket,
  hex,
  onMark,
  onAddInk,
  onWeigh,
  busy,
}: {
  bucket: BucketRow;
  hex: string;
  onMark: (bucketId: number, status: BucketStatus) => void;
  onAddInk: (bucketId: number, grams: number) => void;
  onWeigh: (bucketId: number, measuredWeight: number) => void;
  busy: boolean;
}) {
  const pct = bucket.capacity > 0 ? Math.min(100, Math.round((bucket.currentAmount / bucket.capacity) * 100)) : 0;

  return (
    <div className="ref-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="rcode code">{bucket.loc}</span>
        <span className="design" style={{ fontSize: 11 }}>
          {bucket.bucketTypeName}
          {bucket.isPrimary ? " · primary" : ""}
        </span>
        <span className="rstate" style={{ background: `color-mix(in srgb, ${FULLNESS_COLOR[bucket.fullness]} 16%, transparent)`, color: FULLNESS_COLOR[bucket.fullness] }}>
          {FULLNESS_LABEL[bucket.fullness]}
        </span>
        <span className={`state-tag ${bucket.status}`} style={{ marginLeft: "auto" }}>
          {STATUS_LABEL[bucket.status]}
        </span>
      </div>
      <div className="chan-row" style={{ margin: 0 }}>
        <span className="name" style={{ width: "auto", fontSize: 12.5 }}>
          {Math.round(bucket.currentAmount)}g / {bucket.capacity}g
        </span>
        <div className="track">
          <div className="val" style={{ width: `${pct}%`, background: hex }} />
        </div>
        <span className="pct">{pct}%</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--mist)" }}>
        {bucket.lastWeighedAt
          ? `Last weighed ${new Date(bucket.lastWeighedAt).toLocaleDateString()} · read ${bucket.lastMeasuredWeight}g (tare ${bucket.tareWeight}g)`
          : "Never weighed yet"}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="mark-btns">
          {(["available", "in_use", "empty"] as BucketStatus[]).map((s) => (
            <button key={s} className={bucket.status === s ? `active-${s}` : ""} disabled={busy} onClick={() => onMark(bucket.id, s)} style={{ padding: "8px 14px", fontSize: 12.5 }}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <AddInkForm bucketId={bucket.id} onSubmit={onAddInk} busy={busy} />
        <WeighForm bucketId={bucket.id} onSubmit={onWeigh} busy={busy} />
      </div>
    </div>
  );
}

export function ColorResultCard({
  result,
  onMark,
  onAddInk,
  onWeigh,
  busy,
}: {
  result: ColorSearchResult;
  onMark: (bucketId: number, status: BucketStatus) => void;
  onAddInk: (bucketId: number, grams: number) => void;
  onWeigh: (bucketId: number, measuredWeight: number) => void;
  busy: boolean;
}) {
  const drops = splashDrops(result.colorId);

  return (
    <>
      <div className="splash" style={{ "--sc": result.hex } as React.CSSProperties}>
        <div className="blob" />
        {drops.map((d, i) => (
          <i
            key={i}
            className="drop"
            style={
              {
                width: d.size,
                height: d.size,
                margin: `-${d.size / 2}px 0 0 -${d.size / 2}px`,
                "--tx": `${d.tx}px`,
                "--ty": `${d.ty}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="result-card color-card available">
        <div className="rc-top">
          <div className="swatch" style={{ background: result.hex }} />
          <div className="cinfo">
            <div className="lbl">Paint color</div>
            <div className="cname">{result.name}</div>
            <div className="ccode code">{result.pmsCode}</div>
          </div>
          {result.freshnessWarning && <div className="state-tag empty">⚠ Freshness warning</div>}
        </div>

        <div className="rc-refs">
          <div className="cap">
            Buckets ({result.buckets.length}) · logged {new Date(result.createdAt).toLocaleDateString()}
          </div>
          <div className="ref-list">
            {result.buckets.map((b) => (
              <BucketCard key={b.id} bucket={b} hex={result.hex} onMark={onMark} onAddInk={onAddInk} onWeigh={onWeigh} busy={busy} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
