import Link from "next/link";
import { requireTech } from "@/lib/auth";

export default async function TechHubPage() {
  const profile = await requireTech();

  const tiles = [
    { href: "/tech/log-cart", idx: "01", title: "Log a cart", desc: "Cart name + number of slots — auto-generates that cart's barcoded shelves.", tint: "locator" as const },
    { href: "/tech/log-screen", idx: "02", title: "Log a screen", desc: "Screen number → separation references → scan the shelf to place it.", tint: "pkg" as const },
    { href: "/tech/log-color", idx: "03", title: "Log a color", desc: "PMS code, bin location, and bucket type — with a duplicate-PMS warning.", tint: "locator" as const },
    { href: "/tech/decommission-screen", idx: "04", title: "Decommission & reassign", desc: "Retire a damaged screen and move its active references to a new one.", tint: "pkg" as const },
    { href: "/analytics", idx: "05", title: "Analytics", desc: "Due-for-wash queue, cart capacity, ink levels, and freshness warnings.", tint: "locator" as const },
  ];
  if (profile.role === "admin") {
    tiles.push({ href: "/tech/manage-carts", idx: "06", title: "Manage carts", desc: "Edit slot counts, fix shelf barcodes, or force-delete a cart with approval.", tint: "locator" as const });
    tiles.push({ href: "/settings", idx: "07", title: "Settings", desc: "Bucket types, fullness thresholds, approval code, freshness & wash thresholds.", tint: "pkg" as const });
  }

  return (
    <section className="view">
      <div className="wrap">
        <p className="eyebrow">Tech · Signed In</p>
        <h1 className="title" style={{ fontSize: "clamp(32px, 5vw, 50px)", marginBottom: 30 }}>
          Tech tools
        </h1>
        <div className="app-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", maxWidth: "none" }}>
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className={`app-tile ${t.tint}`}>
              <div className="plate" />
              <div className="idx">{t.idx}</div>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
              <span className="go">
                Open <span className="arr">→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
