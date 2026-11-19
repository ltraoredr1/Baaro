import { useEffect, useState } from "react";
import { ShoppingBag, Plus, X, ShoppingCart, Loader2 } from "lucide-react";
import { supabase } from "../../../supabaseClient.js";

const money = (value, currency) =>
  `${Number(value || 0).toLocaleString()} ${currency || "XOF"}`;

export default function VideoProductWidget({ video, user, isOwner }) {
  const [linked, setLinked] = useState([]);
  const [ownProducts, setOwnProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("video_products")
      .select("id,product_id,shop_products(id,name,price,currency,stock,type,images,image_url,is_available,shop_id,shops(name,is_active))")
      .eq("video_id", video.id)
      .order("created_at", { ascending: true });
    if (fetchError) {
      setError("Produits indisponibles.");
      setLinked([]);
    } else {
      setLinked((data || []).map((row) => ({
        linkId: row.id,
        ...row.shop_products,
        shop: row.shop_products?.shops,
      })).filter((p) => p.id && p.is_available && p.shop?.is_active));
    }
    setLoading(false);
  };

  useEffect(() => {
    const openCreator = (event) => {
      if (!isOwner || String(event.detail?.videoId) !== String(video.id)) return;
      loadOwnProducts();
    };
    window.addEventListener("baaro:open-video-product-create", openCreator);
    return () => window.removeEventListener("baaro:open-video-product-create", openCreator);
  }, [video.id, isOwner, user?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (!active) return;
    })();
    return () => { active = false; };
  }, [video.id]);

  const loadOwnProducts = async () => {
    if (!user?.id) return;
    setBusy(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("shop_products")
      .select("id,name,price,currency,stock,type,images,image_url,shop_id,shops!inner(name,is_active,owner_id)")
      .eq("shops.owner_id", user.id)
      .eq("shops.is_active", true)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (queryError) setError("Impossible de charger tes produits.");
    else setOwnProducts((data || []).filter((p) => p.shops?.owner_id === user.id));
    setBusy(false);
    setOpen(true);
  };

  const attach = async (product) => {
    if (linked.length >= 3 || linked.some((p) => p.id === product.id)) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase
      .from("video_products")
      .insert({ video_id: video.id, product_id: product.id });
    if (insertError) setError(insertError.code === "23505" ? "Ce produit est déjà associé." : "Association impossible.");
    else {
      setNotice("Produit ajouté à la vidéo.");
      await load();
    }
    setBusy(false);
  };

  const detach = async (product) => {
    setBusy(true);
    const { error: deleteError } = await supabase
      .from("video_products")
      .delete()
      .eq("video_id", video.id)
      .eq("product_id", product.id);
    if (deleteError) setError("Suppression impossible.");
    else await load();
    setBusy(false);
  };

  const addToCart = async (product) => {
    if (!user?.id) { setError("Connecte-toi pour acheter."); return; }
    if (product.type !== "service" && Number(product.stock ?? 0) < 1) {
      setError("Produit en rupture de stock.");
      return;
    }
    setBusy(true);
    setError("");
    const { data: existing, error: findError } = await supabase
      .from("cart").select("id,quantity")
      .eq("user_id", user.id).eq("item_id", product.id).maybeSingle();
    if (findError) {
      setError("Impossible de vérifier le panier.");
      setBusy(false);
      return;
    }
    const quantity = Number(existing?.quantity || 0) + 1;
    const max = product.type === "service" ? 100 : Number(product.stock || 0);
    const safeQuantity = Math.min(quantity, max);
    const result = existing?.id
      ? await supabase.from("cart").update({ quantity: safeQuantity }).eq("id", existing.id).eq("user_id", user.id)
      : await supabase.from("cart").insert({ user_id: user.id, item_id: product.id, quantity: 1 });
    if (result.error) setError("Ajout au panier impossible.");
    else setNotice("Produit ajouté au panier. Retrouve-le dans Shop → Panier.");
    setBusy(false);
  };

  if (loading && linked.length === 0) return null;
  if (!linked.length && !isOwner) return null;

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {linked.length > 0 && (
        <div className="space-y-2">
          {linked.map((product) => {
            const image = product.images?.[0] || product.image_url;
            const out = product.type !== "service" && Number(product.stock ?? 0) <= 0;
            return (
              <div key={product.id} className="flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-black/75 p-2">
                {image ? <img src={image} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10"><ShoppingBag size={18}/></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{product.name}</p>
                  <p className="text-[11px] font-black text-emerald-300">{money(product.price, product.currency)}</p>
                  <p className="truncate text-[10px] text-white/50">{product.shop?.name || "Boutique BAARO"}</p>
                </div>
                {isOwner ? (
                  <button type="button" disabled={busy} onClick={() => detach(product)} className="rounded-lg p-2 text-white/60" aria-label="Retirer le produit"><X size={16}/></button>
                ) : (
                  <button type="button" disabled={busy || out} onClick={() => addToCart(product)} className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-400 px-2.5 py-2 text-[10px] font-black text-black disabled:opacity-40">
                    <ShoppingCart size={13}/>{out ? "Rupture" : "Acheter"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {open && (
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-white/15 bg-black/95 p-3">
          <div className="flex items-center justify-between"><p className="text-xs font-bold text-white">Tes produits disponibles</p><button onClick={() => setOpen(false)} className="p-1 text-white/60"><X size={15}/></button></div>
          {ownProducts.filter((p) => !linked.some((x) => x.id === p.id)).map((product) => (
            <button key={product.id} type="button" disabled={busy} onClick={() => attach(product)} className="flex w-full items-center gap-2 rounded-lg bg-white/5 p-2 text-left">
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white">{product.name}</span><span className="text-[11px] text-emerald-300">{money(product.price, product.currency)}</span></span>
              <Plus size={15} className="text-emerald-300"/>
            </button>
          ))}
          {ownProducts.length === 0 && <p className="text-[11px] text-white/50">Aucun produit disponible dans une boutique active.</p>}
        </div>
      )}
      {(error || notice) && <p className={`mt-1 text-[10px] ${error ? "text-red-300" : "text-emerald-300"}`}>{error || notice}</p>}
    </div>
  );
}
