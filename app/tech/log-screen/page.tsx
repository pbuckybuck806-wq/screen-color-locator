import { LogScreenForm } from "@/components/LogScreenForm";
import { requireTech } from "@/lib/auth";

export default async function LogScreenPage() {
  await requireTech();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Tech · Signed In</p>
            <h1 className="title">Log a screen</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          <LogScreenForm />
        </div>
      </div>
    </section>
  );
}
