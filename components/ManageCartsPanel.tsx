"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editCartShelfCount, editShelfBarcode, deleteCart } from "@/lib/actions/carts";
import { showToast } from "@/lib/toast";
import { ApprovalDeletePrompt } from "@/components/ApprovalDeletePrompt";
import type { CartWithShelves, ShelfRow } from "@/lib/types";

function ShelfBarcodeRow({ shelf }: { shelf: ShelfRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shelf.barcode);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!value.trim()) return showToast("Enter a barcode value.");
    setBusy(true);
    const res = await editShelfBarcode(shelf.shelfId, value.trim());
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    showToast("Barcode updated.");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="ref-row" style={{ fontSize: 13 }}>
      <span className="design" style={{ minWidth: 36 }}>
        #{shelf.position}
      </span>
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            style={{ background: "var(--k)", border: "1px solid var(--cyan)", borderRadius: 8, color: "var(--paper)", padding: "5px 8px", fontSize: 12.5, width: 170 }}
          />
          <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} disabled={busy} onClick={save}>
            Save
          </button>
          <button
            className="btn-ghost"
            style={{ padding: "5px 10px", fontSize: 12 }}
            onClick={() => {
              setValue(shelf.barcode);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="rcode code">{shelf.barcode}</span>
          {shelf.occupied && <span className="rstate run">Occupied</span>}
          <button className="btn-ghost" style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 12 }} onClick={() => setEditing(true)}>
            Edit barcode
          </button>
        </>
      )}
    </div>
  );
}

function CartCard({ cart }: { cart: CartWithShelves }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [shelfCount, setShelfCount] = useState(String(cart.shelfCount));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function saveShelfCount() {
    const n = Number(shelfCount);
    if (!n || n <= 0) return showToast("Enter a number of slots greater than zero.");
    setBusy(true);
    const res = await editCartShelfCount(cart.cartId, n);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    showToast("Slot count updated.");
    router.refresh();
  }

  async function confirmDelete(code: string) {
    setBusy(true);
    const res = await deleteCart(cart.cartId, code);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    showToast(`Cart ${cart.cartCode} deleted.`);
    setRemoved(true);
    router.refresh();
  }

  if (removed) return null;

  const occupiedCount = cart.shelves.filter((s) => s.occupied).length;

  return (
    <div className="result-card avail">
      <div className="ref-row" style={{ flexWrap: "wrap" }}>
        <span className="rcode code">Cart {cart.cartCode}</span>
        <span className="design">
          {occupiedCount}/{cart.shelves.length} occupied
        </span>
        <button className="btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide shelves" : "View / edit shelves"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--mist)" }}>Slot count</label>
        <input
          type="number"
          value={shelfCount}
          onChange={(e) => setShelfCount(e.target.value)}
          style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "6px 10px", fontSize: 13, width: 90 }}
        />
        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={saveShelfCount}>
          Save slot count
        </button>

        {deleting ? (
          <ApprovalDeletePrompt confirmLabel="Confirm delete cart" busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(false)} />
        ) : (
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", fontSize: 12.5, marginLeft: "auto", borderColor: "var(--magenta)", color: "var(--magenta)" }}
            onClick={() => setDeleting(true)}
          >
            Delete cart
          </button>
        )}
      </div>

      {expanded && (
        <div className="ref-list" style={{ marginTop: 16, maxHeight: 320, overflowY: "auto" }}>
          {cart.shelves.map((s) => (
            <ShelfBarcodeRow key={s.shelfId} shelf={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ManageCartsPanel({ initial }: { initial: CartWithShelves[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {initial.map((c) => (
        <CartCard key={c.cartId} cart={c} />
      ))}
      {initial.length === 0 && <p style={{ color: "var(--mist)", fontSize: 13.5 }}>No carts logged yet.</p>}
    </div>
  );
}
