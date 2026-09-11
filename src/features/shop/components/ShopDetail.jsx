import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingCart } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { fetchShopById, fetchShopProducts } from "../../../services/shopApi.js";
import OrderCheckout from "./OrderCheckout.jsx";

export default function ShopDetail({ shopId, userId, onBack }) {
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const [s, p] = await Promise.all([fetchShopById(shopId), fetchShopProducts(shopId)]);
        if (!cancelled) { setShop(s); setProducts(p || []); }
      } catch (e) {
        if (!cancelled) setError(e.message || "Impossible de charger la boutique.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  function add(product) {
    setCart((items) => {
      const old = items.find((x) => x.productId === product.id);
      if (old) return items.map((x) => x.productId === product.id ? { ...x, quantity: x.quantity + 1 } : x);
      return [...items, {
        productId: product.id,
        name: product.name,
        unitPrice: Number(product.price),
        currency: product.currency || shop?.currency || "XOF",
        quantity: 1
      }];
    });
  }

  function change(productId, delta) {
    setCart((items) => items
      .map((x) => x.productId === productId ? { ...x, quantity: x.quantity + delta } : x)
      .filter((x) => x.quantity > 0));
  }

  if (loading) return <p className="text-sm" style={{ color: COLORS.muted }}>Chargement…</p>;
  if (error) return <div className="space-y-3"><button type="button" onClick={onBack}>← Retour</button><p className="text-sm text-red-400">{error}</p></div>;
  if (!shop) return null;

  if (checkout) {
    return <OrderCheckout
      shop={shop}
      userId={userId}
      items={cart}
      onBack={() => setCheckout(false)}
      onDone={() => { setCart([]); setCheckout(false); }}
    />;
  }

  const total = cart.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
  const currency = cart[0]?.currency || shop.currency || "XOF";

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={16} /> Retour
      </button>

      <section className="rounded-2xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
        {shop.logo_url && <img src={shop.logo_url} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />}
        <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>{shop.name}</h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>{[shop.category, shop.city, shop.country].filter(Boolean).join(" · ")}</p>
        {shop.description && <p className="mt-3 text-sm" style={{ color: COLORS.muted }}>{shop.description}</p>}
      </section>

      <div className="grid gap-3">
        {products.map((p) => {
          const qty = cart.find((x) => x.productId === p.id)?.quantity || 0;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
              {p.image_url && <img src={p.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
              <div className="flex-1">
                <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>{p.name}</div>
                {p.description && <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>{p.description}</div>}
                <div className="mt-2 text-sm font-semibold" style={{ color: COLORS.gold }}>{p.price} {p.currency}</div>
              </div>
              {qty === 0 ? (
                <button type="button" onClick={() => add(p)} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>Ajouter</button>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => change(p.id, -1)}><Minus size={15} /></button>
                  <span className="text-sm">{qty}</span>
                  <button type="button" onClick={() => change(p.id, 1)}><Plus size={15} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div className="sticky bottom-2 flex items-center gap-3 rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <ShoppingCart size={18} />
          <div className="flex-1 text-sm">
            {cart.reduce((sum, x) => sum + x.quantity, 0)} article(s)<br />
            <b>{total.toFixed(2)} {currency}</b>
          </div>
          <button type="button" disabled={!userId} onClick={() => setCheckout(true)} className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>
            Commander
          </button>
        </div>
      )}
    </div>
  );
}
