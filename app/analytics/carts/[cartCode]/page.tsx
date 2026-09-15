import Link from "next/link";
import { requireTech } from "@/lib/auth";
import { getCartDetail } from "@/lib/actions/carts";

export default async function CartDetailPage({ params }: { params: Promise<{ cartCode: string }> }) {
  await requireTech();
  const { cartCode } = await params;
  const res = await getCartDetail(cartCode.toUpperCase());

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
            <h1 className="title">Cart {cartCode.toUpperCase()}</h1>
            {res.ok && (
              <p style={{ color: "var(--mist)", fontSize: 14, marginTop: 8 }}>
                {res.data.occupied}/{res.data.shelves.length} shelves occupied
              </p>
            )}
          </div>
        </div>

        {!res.ok ? (
          <p style={{ color: "var(--mist)", marginTop: 24 }}>{res.error}</p>
        ) : (
          <div className="ref-list" style={{ marginTop: 24 }}>
            {res.data.shelves.map((s) => (
              <div className="ref-row" key={s.shelfId} style={{ flexWrap: "wrap" }}>
                <span className="rcode code" style={{ minWidth: 36 }}>
                  #{s.position}
                </span>
                <span className="design" style={{ fontSize: 12 }}>
                  {s.code} · {s.barcode}
                </span>
                {s.screenNumber != null ? (
                  <>
                    <span className="rcode code" style={{ color: "var(--magenta)" }}>
                      Screen #{s.screenNumber}
                    </span>
                    {s.srs.length === 0 ? (
                      <span className="design">No active references</span>
                    ) : (
                      s.srs.map((sr, i) => (
                        <span key={i} className="design">
                          {sr.code}
                          {sr.differentiator ? ` · ${sr.differentiator}` : ""}
                        </span>
                      ))
                    )}
                  </>
                ) : (
                  <span className="rstate done" style={{ marginLeft: "auto" }}>
                    Empty
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
