"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RegMark } from "@/components/IconSymbols";
import { logout } from "@/lib/actions/auth";
import type { Profile } from "@/lib/auth";

export function TopNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

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
        <Link href="/hub" className={pathname === "/hub" ? "active" : ""}>
          Hub
        </Link>
        <Link href="/locator" className={pathname.startsWith("/locator") ? "active" : ""}>
          Locator
        </Link>
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
