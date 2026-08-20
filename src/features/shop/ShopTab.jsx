import { useState } from "react";
import { Store, PlusCircle } from "lucide-react";
import { COLORS } from "../../theme.js";
import { LocalShopDirectory, ShopProductManager } from "./ShopFeature.jsx";
import ShopRegistrationForm from "./ShopRegistrationForm.jsx";
import { supabase } from "../../supabaseClient.js";
import { useEffect } from "react";

/**
 * Onglet Boutiques BAARO
 * - Annuaire local
 * - Inscription boutique
 * - Gestion produits si le user a déjà une boutique
 */
export default function ShopTab({ userId }) {
  const [mode, setMode] = useState("directory"); // directory | register | manage
  const [myShop, setMyShop] = useState(null);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("directory")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={{
            background: mode === "directory" ? COLORS.goldGlow : COLORS.surface2,
            borderColor: mode === "directory" ? COLORS.borderGold : COLORS.border,
            color: mode === "directory" ? COLORS.gold : COLORS.ivory,
          }}
        >
          <Store size={14} />
          Annuaire
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={{
            background: mode === "register" ? COLORS.goldGlow : COLORS.surface2,
            borderColor: mode === "register" ? COLORS.borderGold : COLORS.border,
            color: mode === "register" ? COLORS.gold : COLORS.ivory,
          }}
        >
          <PlusCircle size={14} />
          Créer ma boutique
        </button>
        {myShop && (
          <button
            type="button"
            onClick={() => setMode("manage")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
            style={{
              background: mode === "manage" ? COLORS.tealGlow : COLORS.surface2,
              borderColor: mode === "manage" ? COLORS.borderTeal : COLORS.border,
              color: mode === "manage" ? COLORS.teal : COLORS.ivory,
            }}
          >
            Mes produits
          </button>
        )}
      </div>

      {mode === "directory" && <LocalShopDirectory />}
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
    </div>
  );
}
