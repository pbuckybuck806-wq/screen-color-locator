import { LogCartForm } from "@/components/LogCartForm";
import { requireTech } from "@/lib/auth";

export default async function LogCartPage() {
  await requireTech();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Tech · Signed In</p>
            <h1 className="title">Log a cart</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          <LogCartForm />
        </div>
      </div>
    </section>
  );
}
