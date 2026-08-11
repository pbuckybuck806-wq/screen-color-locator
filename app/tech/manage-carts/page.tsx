import { requireTech } from "@/lib/auth";
import { listCartsWithShelves } from "@/lib/actions/carts";
import { ManageCartsPanel } from "@/components/ManageCartsPanel";

export default async function ManageCartsPage() {
  const profile = await requireTech();
  const res = await listCartsWithShelves();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Tech</p>
            <h1 className="title">Manage carts</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          {res.ok ? <ManageCartsPanel initial={res.data} isAdmin={profile.role === "admin"} /> : <p style={{ color: "var(--mist)" }}>{res.error}</p>}
        </div>
      </div>
    </section>
  );
}
