import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { API_BASE } from "../config.js";
import { getDeviceId } from "../device.js";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState({
    display_name: "Membre BAARO",
    handle: "@membre",
    flag: "🌍",
    bio: "",
  });
  const [pointsBalance, setPointsBalance] = useState(0);
  const [baroBalance, setBaroBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) setUserId(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUserId(session?.user?.id || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Charge profil + soldes quand userId change
  useEffect(() => {
    if (!userId) return;

    (async () => {
      // Profil
      let { data: profile } = await supabase
        .from("profiles")
        .select("display_name, handle, flag, bio")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile) {
        const { data: created } = await supabase
          .from("profiles")
          .upsert({
            user_id: userId,
            display_name: "Membre BAARO",
            handle: `@user_${userId.slice(0, 8)}`,
            flag: "🌍",
          })
          .select()
          .single();
        profile = created;
      }

      if (profile) {
        setUserProfile({
          display_name: profile.display_name || "Membre BAARO",
          handle: profile.handle || "@membre",
          flag: profile.flag || "🌍",
          bio: profile.bio || "",
        });
      }

      // Wallet
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (wallet) setPointsBalance(Number(wallet.balance) || 0);
      else {
        await supabase.from("wallets").upsert({ user_id: userId, balance: 1284 });
        setPointsBalance(1284);
      }

      // BARO
      const { data: crypto } = await supabase
        .from("crypto_holdings")
        .select("holdings")
        .eq("user_id", userId)
        .maybeSingle();
      if (crypto) setBaroBalance(Number(crypto.holdings) || 0);

      // Register device (anti-abus)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch(`${API_BASE}/api/register-device`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ deviceId: getDeviceId() }),
          });
        }
      } catch (e) {
        console.warn("register-device failed", e);
      }
    })();
  }, [userId]);

  // Appel API wallet
  const callWallet = useCallback(async (action, payload = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: "Non authentifié" };

    try {
      const res = await fetch(`${API_BASE}/api/wallet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Erreur serveur" };
      return { ok: true, ...data };
    } catch {
      return { ok: false, error: "Impossible de joindre le serveur" };
    }
  }, []);

  const earnPoints = useCallback(
    async (actionKey, detail = "") => {
      const result = await callWallet("earn", { actionKey, detail });
      if (result.ok && typeof result.balance === "number") {
        setPointsBalance(result.balance);
      }
      return result;
    },
    [callWallet]
  );

  const redeemReward = useCallback(
    async (optionId) => {
      const result = await callWallet("redeem", { optionId });
      if (result.ok && typeof result.balance === "number") {
        setPointsBalance(result.balance);
      }
      return result;
    },
    [callWallet]
  );

  const convertToBaro = useCallback(
    async (pts) => {
      const result = await callWallet("convert", { pts });
      if (result.ok) {
        if (typeof result.balance === "number") setPointsBalance(result.balance);
        if (typeof result.holdings === "number") setBaroBalance(result.holdings);
      }
      return result;
    },
    [callWallet]
  );

  const updateProfile = useCallback(
    async (updates) => {
      if (!userId) return { ok: false };
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", userId);
      if (error) return { ok: false, error };
      setUserProfile((prev) => ({ ...prev, ...updates }));
      return { ok: true };
    },
    [userId]
  );

  const value = {
    session,
    userId,
    userProfile,
    setUserProfile,
    pointsBalance,
    setPointsBalance,
    baroBalance,
    setBaroBalance,
    loading,
    earnPoints,
    redeemReward,
    convertToBaro,
    updateProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
