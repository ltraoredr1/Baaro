import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { COLORS } from "../../theme.js";

/**
 * Annuaire des boutiques actives
 */
export function LocalShopDirectory() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("shops")
        .select("id, name, description, category, country, city, logo_url")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (query.trim()) {
        q = q.or(
          `name.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%,category.ilike.%${query.trim()}%`
        );
      }

      const { data } = await q;
      setShops(data || []);
      setLoading(false);
    })();
  }, [query]);

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        Chargement de l&apos;annuaire…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        placeholder="Rechercher une boutique, ville, catégorie…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      {shops.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucune boutique active pour le moment.
        </p>
      ) : (
        shops.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border p-3"
            style={{ background: COLORS.surface2, borderColor: COLORS.border }}
          >
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {s.name}
            </div>
            <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
              {[s.category, s.city, s.country].filter(Boolean).join(" · ")}
            </div>
            {s.description && (
              <p className="text-xs mt-2 line-clamp-2" style={{ color: COLORS.muted }}>
                {s.description}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Gestion des produits d'une boutique (propriétaire)
 */
export function ShopProductManager({ shopId, shopCurrency = "XOF" }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState("produit");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadProducts() {
    setLoading(true);
    const { data } = await supabase
      .from("shop_products")
      .select("id, name, description, price, currency, type, is_available")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (shopId) loadProducts();
  }, [shopId]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(p) || p < 0) {
      setError("Nom et prix valides requis.");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase.from("shop_products").insert({
        shop_id: shopId,
        name: name.trim(),
        price: p,
        currency: shopCurrency,
        type,
      });
      if (err) throw err;
      setName("");
      setPrice("");
      await loadProducts();
    } catch (err) {
      setError(err.message || "Erreur à l'ajout");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(product) {
    await supabase
      .from("shop_products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);
    await loadProducts();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Nom du produit / service"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        />
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={`Prix (${shopCurrency})`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
            style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <option value="produit">Produit</option>
            <option value="service">Service</option>
          </select>
        </div>
        {error && (
          <p className="text-xs" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl py-2 text-sm font-bold"
          style={{ background: COLORS.goldGlow, color: COLORS.gold }}
        >
          {saving ? "Ajout…" : "Ajouter"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Chargement des produits…
        </p>
      ) : products.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucun produit pour l&apos;instant.
        </p>
      ) : (
        products.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl border p-3"
            style={{ background: COLORS.surface2, borderColor: COLORS.border }}
          >
            <div>
              <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                {p.name}
              </div>
              <div className="text-xs" style={{ color: COLORS.muted }}>
                {p.price} {p.currency} · {p.type}
                {!p.is_available && " · indisponible"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleAvailable(p)}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              {p.is_available ? "Masquer" : "Afficher"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}