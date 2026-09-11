import { useState, useEffect } from "react";
import { Store, PlusCircle, Package, ClipboardList } from "lucide-react";
import { COLORS } from "../../theme.js";
import { supabase } from "../../supabaseClient.js";
import { LocalShopDirectory, ShopProductManager } from "./ShopFeature.jsx";
import ShopRegistrationForm from "./ShopRegistrationForm.jsx";
import ShopDetail from "./components/ShopDetail.jsx";
import OrdersBuyer from "./components/OrdersBuyer.jsx";
import OrdersSeller from "./components/OrdersSeller.jsx";

/**
 * Onglet Boutiques BAARO — version complète
 * Modes : directory | detail | register | manage | orders-buyer | orders-seller
 */
export default function ShopTab({ userId }) {
  const [mode, setMode] = useState("directory");
  const [myShop, setMyShop] = useState(null);
  const [selectedShopId, setSelectedShopId] = useState(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("shops")
        .select("id, name, currency, is_active, country, city")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setMyShop(data || null);
    })();
  }, [userId, mode]);

  const btn = (active, activeColor = "gold") => ({
    background: active
      ? activeColor === "teal"
        ? COLORS.tealGlow || COLORS.goldGlow
        : COLORS.goldGlow
      : COLORS.surface2,
    borderColor: active
      ? activeColor === "teal"
        ? COLORS.borderTeal || COLORS.borderGold
        : COLORS.borderGold
      : COLORS.border,
    color: active
      ? activeColor === "teal"
        ? COLORS.teal || COLORS.gold
        : COLORS.gold
      : COLORS.ivory,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Nav */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("directory");
            setSelectedShopId(null);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={btn(mode === "directory" || mode === "detail")}
        >
          <Store size={14} />
          Annuaire
        </button>

        <button
          type="button"
          onClick={() => setMode("register")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={btn(mode === "register")}
        >
          <PlusCircle size={14} />
          Créer ma boutique
        </button>

        {myShop && (
          <button
            type="button"
            onClick={() => setMode("manage")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
            style={btn(mode === "manage", "teal")}
          >
            <Package size={14} />
            Mes produits
          </button>
        )}

        {myShop && (
          <button
            type="button"
            onClick={() => setMode("orders-seller")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
            style={btn(mode === "orders-seller", "teal")}
          >
            <ClipboardList size={14} />
            Commandes reçues
          </button>
        )}

        {userId && (
          <button
            type="button"
            onClick={() => setMode("orders-buyer")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
            style={btn(mode === "orders-buyer")}
          >
            Mes commandes
          </button>
        )}
      </div>

      {/* Contenu */}
      {mode === "directory" && !selectedShopId && (
        <LocalShopDirectory
          onSelectShop={(s) => {
            setSelectedShopId(s.id);
            setMode("detail");
          }}
        />
      )}

      {mode === "detail" && selectedShopId && (
        <ShopDetail
          shopId={selectedShopId}
          userId={userId}
          onBack={() => {
            setSelectedShopId(null);
            setMode("directory");
          }}
        />
      )}

      {mode === "register" && (
        <ShopRegistrationForm
          onRegistered={() => {
            setMode("manage");
          }}
        />
      )}

      {mode === "manage" && myShop && (
        <ShopProductManager shopId={myShop.id} shopCurrency={myShop.currency} />
      )}
      {mode === "manage" && !myShop && (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucune boutique trouvée. Crée-en une d&apos;abord.
        </p>
      )}

      {mode === "orders-seller" && myShop && (
        <OrdersSeller shopId={myShop.id} />
      )}

      {mode === "orders-buyer" && userId && (
        <OrdersBuyer userId={userId} />
      )}
    </div>
  );
}
