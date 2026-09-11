import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { COLORS } from "../../theme.js";

export function LocalShopDirectory({ onSelectShop }) {
  const [shops, setShops] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        let q = supabase.from("shops")
          .select("id,name,description,category,country,city,logo_url,currency")
          .eq("is_active", true).order("created_at", { ascending: false }).limit(50);
        const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
        if (term) q = q.or(`name.ilike.%${term}%,city.ilike.%${term}%,category.ilike.%${term}%`);
        const { data, error: err } = await q;
        if (err) throw err;
        if (!cancelled) setShops(data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Erreur de chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  if (loading) return <p className="text-sm" style={{ color: COLORS.muted }}>Chargement de l'annuaire…</p>;

  return (
    <div className="flex flex-col gap-3">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une boutique, ville, catégorie…" className="w-full rounded-xl border px-3 py-2 text-sm" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !shops.length && <p className="text-sm" style={{ color: COLORS.muted }}>Aucune boutique active pour le moment.</p>}
      {shops.map((s) => (
        <button key={s.id} type="button" onClick={() => onSelectShop?.(s)} className="rounded-xl border p-3 text-left" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <div className="flex items-center gap-3">
            {s.logo_url && <img src={s.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
            <div>
              <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>{s.name}</div>
              <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>{[s.category, s.city, s.country].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          {s.description && <p className="mt-2 line-clamp-2 text-xs" style={{ color: COLORS.muted }}>{s.description}</p>}
        </button>
      ))}
    </div>
  );
}

export function ShopProductManager({ shopId, shopCurrency = "XOF" }) {
  const [products, setProducts] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState("produit");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase.from("shop_products")
      .select("id,name,description,price,currency,type,is_available")
      .eq("shop_id", shopId).order("created_at", { ascending: false });
    if (err) setError(err.message);
    setProducts(data || []);
    setLoading(false);
  }

  useEffect(() => { if (shopId) load(); }, [shopId]);

  async function add(e) {
    e.preventDefault(); setError("");
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(p) || p < 0) { setError("Nom et prix valides requis."); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.from("shop_products").insert({
        shop_id: shopId, name: name.trim(), price: p, currency: shopCurrency, type
      });
      if (err) throw err;
      setName(""); setPrice(""); await load();
    } catch (e) { setError(e.message || "Erreur à l'ajout."); }
    finally { setSaving(false); }
  }

  async function toggle(product) {
    const { error: err } = await supabase.from("shop_products")
      .update({ is_available: !product.is_available }).eq("id", product.id);
    if (err) setError(err.message); else await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-col gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du produit / service" className="rounded-xl border px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Prix (${shopCurrency})`} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border px-2">
            <option value="produit">Produit</option><option value="service">Service</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button disabled={saving} className="rounded-xl py-2 font-bold" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>{saving ? "Ajout…" : "Ajouter"}</button>
      </form>
      {loading ? <p className="text-sm" style={{ color: COLORS.muted }}>Chargement…</p> : products.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <div><b>{p.name}</b><div className="text-xs" style={{ color: COLORS.muted }}>{p.price} {p.currency} · {p.type}{!p.is_available && " · indisponible"}</div></div>
          <button type="button" onClick={() => toggle(p)} className="text-xs">{p.is_available ? "Masquer" : "Afficher"}</button>
        </div>
      ))}
    </div>
  );
}
