"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RegMark } from "@/components/IconSymbols";
import { logout } from "@/lib/actions/auth";
import type { Profile } from "@/lib/auth";

export function TopNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

  // Hub is the neutral chooser between this app and Package Help Desk — no
  // nav chrome until you've actually picked a side.
  if (pathname === "/hub") return null;

  const onLocator = pathname.startsWith("/locator");

  return (
    <div className="topbar">
      <div className="brandmark">
        <RegMark style={{ color: "var(--cyan)" }} />
        <div>
          <b>Screen + Color Locator</b>
          <span>Shop Floor</span>
        </div>
      </div>
      <div className="navtabs" role="tablist">
        <Link href="/hub">Hub</Link>
        {profile && !onLocator && <Link href="/locator">Locator</Link>}
        {profile && (
          <Link href="/tech" className={pathname === "/tech" ? "active" : ""}>
            Tech tools
          </Link>
        )}
        {profile && (
          <Link href="/analytics" className={pathname.startsWith("/analytics") ? "active" : ""}>
            Analytics
          </Link>
        )}
      </div>
      <div className="nav-auth">
        {profile ? (
          <>
            <span className="who">
              {profile.name} · {profile.role}
            </span>
            <form action={logout}>
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/login">Tech sign in</Link>
        )}
      </div>
    </div>
  );
}
