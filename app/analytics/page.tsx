import { AnalyticsDashboards } from "@/components/AnalyticsDashboards";
import { requireTech } from "@/lib/auth";
import { getScreensDashboard } from "@/lib/actions/analytics";

export default async function AnalyticsPage() {
  const profile = await requireTech();
  const screens = await getScreensDashboard();

  return (
    <section id="analytics" className="view">
      <AnalyticsDashboards profileName={profile.name} profileRole={profile.role} initialScreens={screens} />
    </section>
  );
}
