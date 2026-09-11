import { useState, useEffect } from "react";
import { COLORS } from "../theme.js";
import { fetchActiveShops } from "../services/shopApi.js";
import ShopCard from "./ShopCard.jsx";

/**
 * Annuaire des boutiques actives (avec callback de sélection)
 */
export default function LocalShopDirectory({ onSelectShop }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchActiveShops({ query });
        setShops(data);
      } finally {
        setLoading(false);
      }
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
          <ShopCard key={s.id} shop={s} onClick={onSelectShop} />
        ))
      )}
    </div>
  );
}
