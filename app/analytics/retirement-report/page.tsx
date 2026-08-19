import Link from "next/link";
import { requireTech } from "@/lib/auth";
import { getRetirementReport } from "@/lib/actions/analytics";
import { RetirementReportTable } from "@/components/RetirementReportTable";

export default async function RetirementReportPage() {
  const profile = await requireTech();
  const rows = await getRetirementReport();

  return (
    <section className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">
              <Link href="/analytics" style={{ color: "inherit" }}>
                ← Analytics
              </Link>
            </p>
            <h1 className="title">SR usage &amp; retirement report</h1>
            <p style={{ color: "var(--mist)", fontSize: 14, marginTop: 8 }}>Every SR ever logged — least-used, oldest first.</p>
          </div>
        </div>
        <div className="card" style={{ marginTop: 24 }}>
          <RetirementReportTable rows={rows} isAdmin={profile.role === "admin"} />
        </div>
      </div>
    </section>
  );
}
