import type { BucketFullness } from "@/lib/types";

export function fullnessFor(pct: number, fullPct: number, mediumPct: number, emptyPct: number): BucketFullness {
  if (pct < emptyPct) return "empty";
  if (pct < mediumPct) return "low";
  if (pct < fullPct) return "medium";
  return "full";
}
