import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ShoppingCart, Loader2 } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { fetchShopById, fetchShopProducts } from "../../../services/shopApi.js";
import OrderCheckout from "./OrderCheckout.jsx";
import ShopReviews from "../../../components/ShopReviews.jsx";
import ProductCard from "../../../components/ProductCard.jsx";
import { useToast } from "../../../components/ToastContext.jsx";
import { supabase } from "../../../supabaseClient.js";

export default function ShopDetail({ shopId, id, onBack }) {
  const { showToast } = useToast();
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
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  const addToCart = useCallback(async (product) => {
    if (!id) { showToast("Connectez-vous pour ajouter au panier", "info"); return; }
    const stock = product.type === "service" ? 100 : Number(product.stock ?? 0);
    if (product.type !== "service" && stock <= 0) {
      showToast("Ce produit est en rupture de stock", "error"); return;
    }
    try {
      const { error: rpcError } = await supabase.rpc("add_to_cart", {
        p_user_id: id, p_item_id: product.id, p_quantity: 1,
      });

      if (rpcError && rpcError.code !== "42883") throw rpcError;

      // Compatibility fallback for databases where the legacy RPC is absent.
      if (rpcError?.code === "42883") {
        const { data: existing, error: findError } = await supabase
          .from("cart").select("id, quantity")
          .eq("user_id", id).eq("item_id", product.id).maybeSingle();
        if (findError) throw findError;
        if (existing?.id) {
          const nextQuantity = Math.min(stock, Number(existing.quantity || 0) + 1);
          const { error } = await supabase.from("cart").update({ quantity: nextQuantity })
            .eq("id", existing.id).eq("user_id", id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("cart")
            .insert({ user_id: id, item_id: product.id, quantity: 1 });
          if (error) throw error;
        }
      }

      setCart((items) => {
        const old = items.find((x) => x.productId === product.id);
        if (old) return items.map((x) => x.productId === product.id
          ? { ...x, quantity: Math.min(product.type === "service" ? 100 : stock, x.quantity + 1) } : x);
        return [...items, { productId: product.id, name: product.name,
          unitPrice: Number(product.price), currency: product.currency || shop?.currency || "XOF", quantity: 1 }];
      });
      showToast(`${product.name} ajouté au panier`, "success");
    } catch (e) {
      console.error("Erreur ajout panier:", e);
      showToast(e.message || "Impossible d'ajouter au panier", "error");
    }
  }, [id, shop?.currency, showToast]);

  const changeQuantity = useCallback(async (productId, delta) => {
    if (!id) return;
    const item = cart.find((x) => x.productId === productId);
    if (!item) return;
    const product = products.find((p) => p.id === productId);
    const max = product?.type === "service" ? 100 : Number(product?.stock ?? 100);
    const newQty = Math.max(0, Math.min(max, item.quantity + delta));
    try {
      if (newQty <= 0) {
        const { error } = await supabase.from("cart").delete().eq("item_id", productId).eq("user_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cart").update({ quantity: newQty })
          .eq("item_id", productId).eq("user_id", id);
        if (error) throw error;
      }
      setCart((items) => items.map((x) => x.productId === productId ? { ...x, quantity: newQty } : x)
        .filter((x) => x.quantity > 0));
    } catch (e) {
      console.error("Erreur mise à jour panier:", e);
      showToast(e.message || "Erreur de mise à jour", "error");
    }
  }, [id, cart, products, showToast]);

  if (loading) return <div className="flex flex-col items-center justify-center py-12 gap-3"><Loader2 className="animate-spin" size={32} style={{ color: COLORS.gold }} /><p className="text-sm" style={{ color: COLORS.muted }}>Chargement de la boutique…</p></div>;
  if (error) return <div className="space-y-4 text-center py-8"><p className="text-sm" style={{ color: "#ef4444" }}>{error}</p><button onClick={onBack} className="text-sm underline" style={{ color: COLORS.ivory }}>Retour</button></div>;
  if (!shop) return null;
  if (checkout) return <OrderCheckout shop={shop} id={id} items={cart} onBack={() => setCheckout(false)} onDone={() => { setCart([]); setCheckout(false); }} />;

  const total = cart.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
  const currency = cart[0]?.currency || shop.currency || "XOF";
  const totalItems = cart.reduce((sum, x) => sum + x.quantity, 0);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80 w-fit" style={{ color: COLORS.ivory }}><ArrowLeft size={16} /> Retour</button>
      <section className="rounded-2xl border p-4 shadow-sm" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        {shop.logo_url && <img src={shop.logo_url} alt={shop.name} className="mb-3 h-32 w-full rounded-xl object-cover" />}
        <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>{shop.name}</h2>
        <p className="mt-1 text-xs flex flex-wrap gap-1" style={{ color: COLORS.muted }}>{[shop.category, shop.city, shop.country].filter(Boolean).map((item, i, arr) => (<span key={i}>{item}{i < arr.length - 1 ? " · " : ""}</span>))}</p>
        {shop.description && <p className="mt-3 text-sm leading-relaxed" style={{ color: COLORS.muted }}>{shop.description}</p>}
      </section>
      <div className="flex flex-col gap-3">
        {products.length === 0 ? <div className="text-center py-8"><p className="text-sm" style={{ color: COLORS.muted }}>Aucun produit disponible pour le moment.</p></div> : products.map((p) => {
          const qty = cart.find((x) => x.productId === p.id)?.quantity || 0;
          return <ProductCard key={p.id} product={{ ...p, currency: p.currency || currency }} quantity={qty} onAdd={() => addToCart(p)} onRemove={() => changeQuantity(p.id, -1)} />;
        })}
      </div>
      <div className="mt-4 px-1"><h3 className="text-sm font-bold mb-3" style={{ color: COLORS.ivory }}>Avis clients</h3><ShopReviews shopId={shopId} id={id} /></div>
      {cart.length > 0 && <div className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto flex items-center gap-3 rounded-xl border p-3 shadow-2xl backdrop-blur-md z-40" style={{ background: `${COLORS.surface}E6`, borderColor: COLORS.borderGold }}>
        <div className="p-2 rounded-full flex-shrink-0" style={{ background: COLORS.gold }}><ShoppingCart size={18} style={{ color: COLORS.bg }} /></div>
        <div className="flex-1 text-sm min-w-0"><div className="font-semibold truncate" style={{ color: COLORS.ivory }}>{totalItems} article(s)</div><div className="text-xs" style={{ color: COLORS.muted }}>Total: <span className="font-bold" style={{ color: COLORS.gold }}>{total.toLocaleString()} {currency}</span></div></div>
        <button type="button" disabled={!id} onClick={() => setCheckout(true)} className="rounded-lg px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" style={{ background: COLORS.gold, color: COLORS.bg }}>Commander</button>
      </div>}
    </div>
  );
}
