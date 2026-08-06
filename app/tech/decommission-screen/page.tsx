import { DecommissionScreenForm } from "@/components/DecommissionScreenForm";
import { requireTech } from "@/lib/auth";

export default async function DecommissionScreenPage() {
  await requireTech();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Tech · Signed In</p>
            <h1 className="title">Decommission &amp; reassign</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          <DecommissionScreenForm />
        </div>
      </div>
    </section>
  );
}
