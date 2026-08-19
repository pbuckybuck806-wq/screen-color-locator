"use client";

import { useMemo, useState } from "react";
import type { RetirementReportRow } from "@/lib/actions/analytics";

const SR_TYPE_LABEL: Record<string, string> = { permanent: "Permanent", one_off: "One-off" };

function formatDate(iso: string | null) {
  if (!iso) return "Never used";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const LAST_USED_BUCKETS = [
  { value: "all", label: "Any time" },
  { value: "never", label: "Never used" },
  { value: "0-7", label: "Last 7 days" },
  { value: "8-30", label: "8–30 days ago" },
  { value: "31-90", label: "31–90 days ago" },
  { value: "91-180", label: "91–180 days ago" },
  { value: "181-365", label: "181–365 days ago" },
  { value: "365+", label: "Over a year ago" },
] as const;
type LastUsedBucket = (typeof LAST_USED_BUCKETS)[number]["value"];

function inBucket(days: number | null, bucket: LastUsedBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "never") return days === null;
  if (days === null) return false;
  if (bucket === "0-7") return days <= 7;
  if (bucket === "8-30") return days > 7 && days <= 30;
  if (bucket === "31-90") return days > 30 && days <= 90;
  if (bucket === "91-180") return days > 90 && days <= 180;
  if (bucket === "181-365") return days > 180 && days <= 365;
  return days > 365;
}

type SortKey = "useCount" | "daysSince" | "firstShotAt";
type SortDir = "asc" | "desc";

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <th style={{ cursor: "pointer", userSelect: "none" }} onClick={onClick}>
      {label} <span style={{ color: active ? "var(--cyan)" : "var(--mist-2)" }}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}

export function RetirementReportTable({ rows }: { rows: RetirementReportRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("daysSince");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<"all" | "permanent" | "one_off">("all");
  const [lastUsedFilter, setLastUsedFilter] = useState<LastUsedBucket>("all");

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const decorated = useMemo(() => rows.map((r) => ({ ...r, days: daysSince(r.lastUsedAt) })), [rows]);

  const filtered = useMemo(
    () =>
      decorated.filter((r) => (typeFilter === "all" || r.srType === typeFilter) && inBucket(r.days, lastUsedFilter)),
    [decorated, typeFilter, lastUsedFilter],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "useCount") return (a.useCount - b.useCount) * dir;
      if (sortKey === "daysSince") {
        // Never-used rows sort as "oldest" (furthest from last use).
        const av = a.days ?? Infinity;
        const bv = b.days ?? Infinity;
        return (av - bv) * dir;
      }
      return (new Date(a.firstShotAt).getTime() - new Date(b.firstShotAt).getTime()) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--mist)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          Type
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "8px 10px", fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="permanent">Permanent</option>
            <option value="one_off">One-off</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--mist)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          Last used
          <select
            value={lastUsedFilter}
            onChange={(e) => setLastUsedFilter(e.target.value as LastUsedBucket)}
            style={{ background: "var(--k)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--paper)", padding: "8px 10px", fontSize: 13 }}
          >
            {LAST_USED_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-good">No references match these filters.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Screen</th>
                <th>Type</th>
                <SortHeader label="First shot" active={sortKey === "firstShotAt"} dir={sortDir} onClick={() => toggleSort("firstShotAt")} />
                <th>Last used</th>
                <SortHeader label="Days since last used" active={sortKey === "daysSince"} dir={sortDir} onClick={() => toggleSort("daysSince")} />
                <SortHeader label="Use count" active={sortKey === "useCount"} dir={sortDir} onClick={() => toggleSort("useCount")} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.srId}>
                  <td>
                    <span className="rcode code" style={{ color: "var(--yellow)" }}>
                      {r.srCode}
                    </span>
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
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.days === null ? "—" : r.days}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.useCount}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
