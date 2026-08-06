import { SettingsForm } from "@/components/SettingsForm";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/actions/settings";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="title">Settings</h1>
          </div>
        </div>
        <div className="result-stage" style={{ minHeight: 0, marginTop: 24 }}>
          <SettingsForm initial={settings} />
        </div>
      </div>
    </section>
  );
}
