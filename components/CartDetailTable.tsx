"use client";

import { useState } from "react";
import type { CartDetailShelf, CartDetailSr } from "@/lib/types";
import { editSr } from "@/lib/actions/screens";
import { showToast } from "@/lib/toast";

function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function SrEditLine({
  sr,
  busy,
  onSave,
  onCancel,
}: {
  sr: CartDetailSr;
  busy: boolean;
  onSave: (input: { srCode: string; differentiator?: string; srType: "permanent" | "one_off"; firstShotAt: string }) => void;
  onCancel: () => void;
}) {
  const [srCode, setSrCode] = useState(sr.code);
  const [differentiator, setDifferentiator] = useState(sr.differentiator ?? "");
  const [srType, setSrType] = useState<"permanent" | "one_off">(sr.srType);
  const [firstShotAt, setFirstShotAt] = useState(toDateInputValue(sr.firstShotAt));

  function submit() {
    if (!srCode.trim()) return;
    onSave({ srCode, differentiator: differentiator || undefined, srType, firstShotAt: new Date(firstShotAt).toISOString() });
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0" }}>
      <input
        autoFocus
        value={srCode}
        onChange={(e) => setSrCode(e.target.value)}
        style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 9px", fontSize: 12.5, width: 120 }}
      />
      <input
        placeholder="Differentiator"
        value={differentiator}
        onChange={(e) => setDifferentiator(e.target.value)}
        style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 9px", fontSize: 12.5, width: 110 }}
      />
      <input
        type="date"
        value={firstShotAt}
        onChange={(e) => setFirstShotAt(e.target.value)}
        style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 9px", fontSize: 12.5, colorScheme: "dark" }}
      />
      <div className="mark-btns">
        <button type="button" className={srType === "permanent" ? "active-available" : ""} onClick={() => setSrType("permanent")} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          Permanent
        </button>
        <button type="button" className={srType === "one_off" ? "active-in_use" : ""} onClick={() => setSrType("one_off")} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          One-off
        </button>
      </div>
      <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} disabled={busy} onClick={submit}>
        Save
      </button>
      <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function CartDetailTable({ shelves }: { shelves: CartDetailShelf[] }) {
  const [liveShelves, setLiveShelves] = useState(shelves);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave(srId: number, input: { srCode: string; differentiator?: string; srType: "permanent" | "one_off"; firstShotAt: string }) {
    setBusy(true);
    const res = await editSr(srId, input);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setLiveShelves((prev) =>
      prev.map((s) => ({
        ...s,
        srs: s.srs.map((sr) =>
          sr.srId === srId
            ? { ...sr, code: input.srCode.toUpperCase().trim(), differentiator: input.differentiator ?? null, srType: input.srType, firstShotAt: input.firstShotAt }
            : sr,
        ),
      })),
    );
    setEditingId(null);
    showToast("Reference updated.");
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Shelf</th>
            <th>Screen</th>
            <th>Active references</th>
          </tr>
        </thead>
        <tbody>
          {liveShelves.map((s) => (
            <tr key={s.shelfId}>
              <td>#{s.position}</td>
              <td>
                <span className="code">{s.code}</span>
                <span style={{ color: "var(--mist)", marginLeft: 8, fontSize: 12 }}>{s.barcode}</span>
              </td>
              {s.screenNumber != null ? (
                <>
                  <td>
                    <span className="rcode code" style={{ color: "var(--magenta)" }}>
                      #{s.screenNumber}
                    </span>
                  </td>
                  <td>
                    {s.srs.length === 0 ? (
                      <span style={{ color: "var(--mist)" }}>No active references</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.srs.map((sr) =>
                          editingId === sr.srId ? (
                            <SrEditLine key={sr.srId} sr={sr} busy={busy} onSave={(input) => handleSave(sr.srId, input)} onCancel={() => setEditingId(null)} />
                          ) : (
                            <div key={sr.srId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="rcode code" style={{ color: "var(--yellow)" }}>
                                {sr.code}
                              </span>
                              {sr.differentiator && (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "var(--line-2)", color: "var(--paper)" }}>
                                  {sr.differentiator}
                                </span>
                              )}
                              <button className="btn-ghost" style={{ padding: "3px 9px", fontSize: 11.5 }} disabled={busy} onClick={() => setEditingId(sr.srId)}>
                                Edit
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </td>
                </>
              ) : (
                <td colSpan={2} style={{ color: "var(--good)" }}>
                  Empty
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
