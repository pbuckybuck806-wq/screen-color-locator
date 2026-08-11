"use client";

import { useState } from "react";

// Inline "type the 4-digit approval code to confirm" control used everywhere
// a force-delete needs manager sign-off — reuses the same code as multi-bucket
// approval rather than a separate delete-specific one.
export function ApprovalDeletePrompt({
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  busy: boolean;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        autoFocus
        placeholder="Approval code"
        maxLength={4}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onConfirm(code)}
        style={{ background: "var(--k)", border: "1px solid var(--magenta)", borderRadius: 8, color: "var(--paper)", padding: "6px 10px", fontSize: 12.5, width: 120 }}
      />
      <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5, borderColor: "var(--magenta)", color: "var(--magenta)" }} disabled={busy} onClick={() => onConfirm(code)}>
        {confirmLabel}
      </button>
      <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
