import { LogColorForm } from "@/components/LogColorForm";
import { requireTech } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";

export default async function LogColorPage() {
  await requireTech();
  const settings = await getSettings();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Tech · Signed In</p>
            <h1 className="title">Log a color</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          <LogColorForm bucketTypes={settings.bucketTypes} />
        </div>
      </div>
    </section>
  );
}
