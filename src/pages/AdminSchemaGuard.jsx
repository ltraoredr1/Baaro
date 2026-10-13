import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

// Garde d'accès admin (interface seulement : la vraie protection doit rester
// côté Supabase avec les règles RLS / fonctions sécurisées).
export default function AdminSchemaGuard({ children }) {
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error("[BAARO] Vérification admin impossible :", error);
          return;
        }

        if (!cancelled) setOk(data?.role === "admin");
      } catch (error) {
        console.error("[BAARO] Erreur garde admin :", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-4">Vérification...</div>;
  if (!ok) return <div className="p-4 text-red-500">Accès admin requis</div>;
  return children;
}
