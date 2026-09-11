import { useEffect, useState } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { COLORS } from "../theme.js";
import { fetchShopById, fetchShopProducts } from "../services/shopApi.js";
import ProductCard from "./ProductCard.jsx";
import OrderCheckout from "./OrderCheckout.jsx";
import ShopReviews from "./ShopReviews.jsx";

export default function ShopDetail({ shopId, userId, onBack }) {
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [tab, setTab] = useState("products"); // products | reviews
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, p] = await Promise.all([
          fetchShopById(shopId),
          fetchShopProducts(shopId),
        ]);
        setShop(s);
        setProducts(p);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  if (loading) {
    return (
      <p className="text-sm p-4" style={{ color: COLORS.muted }}>
        Chargement…
      </p>
    );
  }
  if (!shop) {
    return (
      <p className="text-sm p-4" style={{ color: COLORS.muted }}>
        Boutique introuvable.
      </p>
    );
  }

  if (showCheckout) {
    return (
      <OrderCheckout
        shop={shop}
        cart={cart}
        userId={userId}
        onBack={() => setShowCheckout(false)}
        onSuccess={() => {
          setCart([]);
          setShowCheckout(false);
          onBack?.();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm self-start"
        style={{ color: COLORS.muted }}
      >
        <ArrowLeft size={16} /> Retour
      </button>

      <div
        className="rounded-2xl border p-4"
        style={{ background: COLORS.surface2, borderColor: COLORS.border }}
      >
        <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
          {shop.name}
        </h2>
        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
          {[shop.category, shop.city, shop.country].filter(Boolean).join(" · ")}
        </p>
        {shop.description && (
          <p className="text-sm mt-3" style={{ color: COLORS.muted }}>
            {shop.description}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {[
            { id: "products", label: "Produits" },
            { id: "reviews", label: "Avis" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border"
              style={{
                background: tab === t.id ? COLORS.goldGlow : COLORS.surface2,
                borderColor: tab === t.id ? COLORS.borderGold : COLORS.border,
                color: tab === t.id ? COLORS.gold : COLORS.ivory,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "products" && cartCount > 0 && (
          <button
            type="button"
            onClick={() => setShowCheckout(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: COLORS.goldGlow, color: COLORS.gold }}
          >
            <ShoppingBag size={14} />
            Panier ({cartCount})
          </button>
        )}
      </div>

      {tab === "products" && (
        <>
          {products.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Aucun produit disponible.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={() => addToCart(p)} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "reviews" && <ShopReviews shopId={shopId} userId={userId} />}
    </div>
  );
}
