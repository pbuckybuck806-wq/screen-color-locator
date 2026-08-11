import { LocatorApp } from "@/components/LocatorApp";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

async function getSampleQueries() {
  const supabase = await createSupabaseServerClient();

  const { data: srRows } = await supabase
    .from("separation_references")
    .select("sr_code")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(4);

  const { data: colorRows } = await supabase
    .from("paint_colors")
    .select("pms_code, hex")
    .order("id")
    .limit(4);

  return {
    screenRefs: (srRows ?? []).map((r) => r.sr_code),
    colorSamples: (colorRows ?? []).map((c) => ({ code: c.pms_code, hex: c.hex ?? "#8B9AAA" })),
  };
}

export default async function LocatorPage() {
  const [profile, samples] = await Promise.all([getProfile(), getSampleQueries()]);

  return (
    <LocatorApp
      isTech={!!profile}
      isAdmin={profile?.role === "admin"}
      screenSamples={samples.screenRefs}
      colorSamples={samples.colorSamples}
    />
  );
}
