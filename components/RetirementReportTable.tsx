import type { RetirementReportRow } from "@/lib/actions/analytics";

const SR_TYPE_LABEL: Record<string, string> = { permanent: "Permanent", one_off: "One-off" };

function formatDate(iso: string | null) {
  if (!iso) return "Never used";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function RetirementReportTable({ rows }: { rows: RetirementReportRow[] }) {
  if (rows.length === 0) {
    return <div className="empty-good">No active SRs logged yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Screen</th>
            <th>Type</th>
            <th>First shot</th>
            <th>Last used</th>
            <th>Use count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.srId}>
              <td>
                <span className="rcode code">{r.srCode}</span>
                {r.differentiator && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, background: "var(--line-2)", color: "var(--paper)" }}>
                    {r.differentiator}
                  </span>
                )}
              </td>
              <td>#{r.screenNumber}</td>
              <td>{SR_TYPE_LABEL[r.srType]}</td>
              <td>{formatDate(r.firstShotAt)}</td>
              <td>{formatDate(r.lastUsedAt)}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.useCount}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
