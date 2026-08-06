"use client";

import { useState } from "react";
import { logCart } from "@/lib/actions/carts";
import { showToast } from "@/lib/toast";

export function LogCartForm() {
  const [code, setCode] = useState("");
  const [shelfCount, setShelfCount] = useState("30");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!code.trim()) return showToast("Enter a cart name/code.");
    const n = Number(shelfCount);
    if (!n || n <= 0) return showToast("Enter a number of slots greater than zero.");

    setBusy(true);
    const res = await logCart(code, n);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setDone(`Cart ${code.trim().toUpperCase()} created with ${n} shelves.`);
  }

  function reset() {
    setCode("");
    setShelfCount("30");
    setDone(null);
  }

  if (done) {
    return (
      <div className="result-card avail">
        <p style={{ margin: 0, fontSize: 15 }}>{done}</p>
        <div className="rc-actions">
          <button className="btn-primary" onClick={reset}>
            Log another cart
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: "100%", background: "var(--k)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--paper)", padding: "13px 16px", fontSize: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--mist)", marginBottom: 8 };

  return (
    <div className="result-card avail">
      <label style={labelStyle}>Cart name / code</label>
      <input className="code" style={{ ...inputStyle, marginBottom: 20 }} placeholder="e.g. EE" value={code} onChange={(e) => setCode(e.target.value)} />

      <label style={labelStyle}>Number of slots (shelves)</label>
      <input type="number" min="1" style={{ ...inputStyle, marginBottom: 20 }} value={shelfCount} onChange={(e) => setShelfCount(e.target.value)} />

      <div className="rc-actions">
        <button className="btn-primary" onClick={submit} disabled={busy}>
          Create cart
        </button>
      </div>
    </div>
  );
}
