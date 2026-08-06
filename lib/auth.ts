import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Profile = { id: string; email: string; name: string; role: "tech" | "admin" };

export async function getProfile(): Promise<Profile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // RLS: read_own_profile policy allows a user to read only their own row.
    const { data } = await supabase.from("profiles").select("id, name, role").eq("id", user.id).single();
    if (!data) return null;

    return { id: user.id, email: user.email ?? "", name: data.name, role: data.role };
  } catch {
    // Supabase unreachable (e.g. not configured yet) — degrade to logged-out
    // rather than taking down every page, since the root layout calls this.
    return null;
  }
}

export async function requireTech(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireTech();
  if (profile.role !== "admin") redirect("/locator");
  return profile;
}
