import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ShoppingCart, Loader2 } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { fetchShopById, fetchShopProducts } from "../../../services/shopApi.js";
import ShopReviews from "../../../components/ShopReviews.jsx";
import ProductCard from "../../../components/ProductCard.jsx";
import { useToast } from "../../../components/ToastContext.jsx";
import { supabase } from "../../../supabaseClient.js";
import InlineTranslate from "../../../components/InlineTranslate.jsx";

export default function ShopDetail({ shopId, id, onBack }) {
  const { showToast } = useToast();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // CORRECTION : Synchronisé avec la table cart
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // CORRECTION : Charger le panier depuis Supabase
  const loadCart = useCallback(async () => {
    if (!id) return;
    try {
      const { data: rows, error } = await supabase.from("cart")
        .select("id, item_id, quantity").eq("user_id", id);
      if (error) throw error;
      
      const ids = [...new Set((rows || []).map(r => r.item_id))];
      if (!ids.length) { setCart([]); return; }
      
      const { data: products, error: prodError } = await supabase.from("shop_products")
        .select("id, name, price, currency, stock, type, shop_id")
        .in("id", ids);
      if (prodError) throw prodError;
      
      const byId = new Map((products || []).map(p => [p.id, p]));
      const cartItems = (rows || []).map(row => {
        const product = byId.get(row.item_id);
        return {
          productId: row.item_id,
          name: product?.name,
          unitPrice: Number(product?.price || 0),
          currency: product?.currency || shop?.currency || "XOF",
          quantity: row.quantity
        };
      }).filter(item => item.productId);
      
      setCart(cartItems);
    } catch (err) {
      console.error("Erreur chargement panier:", err);
    }
  }, [id, shop?.currency]);

  useEffect(() => { loadCart(); }, [loadCart]);

  const addToCart = useCallback(async (product) => {
    if (!id) { showToast("Connectez-vous pour ajouter au panier", "info"); return; }
    const stock = product.type === "service" ? 100 : Number(product.stock ?? 0);
    if (product.type !== "service" && stock <= 0) {
      showToast("Ce produit est en rupture de stock", "error"); return;
    }
    try {
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

      await loadCart();
      showToast(`${product.name} ajouté au panier`, "success");
    } catch (e) {
      console.error("Erreur ajout panier:", e);
      showToast(e.message || "Impossible d'ajouter au panier", "error");
    }
  }, [id, showToast, loadCart]);

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
      await loadCart();
    } catch (e) {
      console.error("Erreur mise à jour panier:", e);
      showToast(e.message || "Erreur de mise à jour", "error");
    }
  }, [id, cart, products, showToast, loadCart]);

  if (loading) return <div className="flex flex-col items-center justify-center py-12 gap-3"><Loader2 className="animate-spin" size={32} style={{ color: COLORS.gold }} /><p className="text-sm" style={{ color: COLORS.muted }}>Chargement de la boutique…</p></div>;
  if (error) return <div className="space-y-4 text-center py-8"><p className="text-sm" style={{ color: "#ef4444" }}>{error}</p><button onClick={onBack} className="text-sm underline" style={{ color: COLORS.ivory }}>Retour</button></div>;
  if (!shop) return null;

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
        {shop.description && <InlineTranslate text={shop.description} as="p" className="mt-3 text-sm leading-relaxed" style={{ color: COLORS.muted }} />}
      </section>
      <div className="flex flex-col gap-3">
        {products.length === 0 ? <div className="text-center py-8"><p className="text-sm" style={{ color: COLORS.muted }}>Aucun produit disponible pour le moment.</p></div> : products.map((p) => {
          const qty = cart.find((x) => x.productId === p.id)?.quantity || 0;
          return <ProductCard key={p.id} product={{ ...p, currency: p.currency || currency }} quantity={qty} onAdd={() => addToCart(p)} onRemove={() => changeQuantity(p.id, -1)} />;
        })}
      </div>
      <div className="mt-4 px-1"><h3 className="text-sm font-bold mb-3" style={{ color: COLORS.ivory }}>Avis clients</h3><ShopReviews shopId={shopId} id={id} /></div>
    </div>
  );
}
