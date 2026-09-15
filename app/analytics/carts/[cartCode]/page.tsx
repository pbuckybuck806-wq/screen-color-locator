import Link from "next/link";
import { requireTech } from "@/lib/auth";
import { getCartDetail } from "@/lib/actions/carts";
import { CartDetailTable } from "@/components/CartDetailTable";

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
            <CartDetailTable shelves={res.data.shelves} />
          </div>
        )}
      </div>
    </section>
  );
}
