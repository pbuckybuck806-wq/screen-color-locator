import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// The one Supabase client the whole app uses server-side: URL + publishable
// (anon) key only, cookie-bound to the visitor's session. Used for both the
// tech/admin auth session AND all data access — reads rely on open RLS
// SELECT policies, writes go through SECURITY DEFINER RPC functions that
// check auth.uid()/profiles.role internally. There is no service-role client
// anywhere in this app.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a Server Component render where cookies can't be set; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
