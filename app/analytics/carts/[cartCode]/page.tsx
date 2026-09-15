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
          <div className="card" style={{ marginTop: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Shelf</th>
                    <th>Screen</th>
                    <th>Active references</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.shelves.map((s) => (
                    <tr key={s.shelfId}>
                      <td>#{s.position}</td>
                      <td>
                        <span className="code">{s.code}</span>
                        <span style={{ color: "var(--mist)", marginLeft: 8, fontSize: 12 }}>{s.barcode}</span>
                      </td>
                      {s.screenNumber != null ? (
                        <>
                          <td>
                            <span className="rcode code" style={{ color: "var(--magenta)" }}>
                              #{s.screenNumber}
                            </span>
                          </td>
                          <td>
                            {s.srs.length === 0 ? (
                              <span style={{ color: "var(--mist)" }}>No active references</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {s.srs.map((sr, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="rcode code" style={{ color: "var(--yellow)" }}>
                                      {sr.code}
                                    </span>
                                    {sr.differentiator && (
                                      <span
                                        style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "var(--line-2)", color: "var(--paper)" }}
                                      >
                                        {sr.differentiator}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} style={{ color: "var(--good)" }}>
                          Empty
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
