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
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Plafond quotidien
  const [earnedToday, setEarnedToday] = useState(0);
  const [remainingToday, setRemainingToday] = useState(100);
  const [dailyCap, setDailyCap] = useState(100);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUserId(session.user.id);
        setIsAnonymous(session.user.is_anonymous === true);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserId(session?.user?.id || null);
      setIsAnonymous(session?.user?.is_anonymous === true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Appel générique à /api/wallet
  const callWallet = useCallback(async (action, payload = {}) => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      return { ok: false, error: "Non authentifié" };
    }

    try {
      const res = await fetch(`${API_BASE}/api/wallet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || "Erreur serveur" };
      }
      return { ok: true, ...data };
    } catch {
      return { ok: false, error: "Impossible de joindre le serveur" };
    }
  }, []);

  // Charge profil + status wallet (serveur) quand userId change
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
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
              bio: "",
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

        // Status wallet côté serveur (crée le wallet + bonus bienvenue si besoin)
        const status = await callWallet("status");
        if (status.ok) {
          if (typeof status.balance === "number") setPointsBalance(status.balance);
          if (typeof status.holdings === "number") setBaroBalance(status.holdings);
          if (typeof status.earnedToday === "number") setEarnedToday(status.earnedToday);
          if (typeof status.remainingToday === "number") setRemainingToday(status.remainingToday);
          if (typeof status.dailyCap === "number") setDailyCap(status.dailyCap);
        }

        // Register device (anti-abus)
        try {
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();
          if (currentSession?.access_token) {
            await fetch(`${API_BASE}/api/register-device`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentSession.access_token}`,
              },
              body: JSON.stringify({ deviceId: getDeviceId() }),
            });
          }
        } catch (e) {
          console.warn("[BAARO] register-device failed", e);
        }
      } catch (err) {
        console.error("[BAARO] Erreur chargement données utilisateur:", err);
      }
    })();
  }, [userId, callWallet]);

  const earnPoints = useCallback(
    async (actionKey, detail = "") => {
      const result = await callWallet("earn", { actionKey, detail });
      if (result.ok) {
        if (typeof result.balance === "number") setPointsBalance(result.balance);
        if (typeof result.earnedToday === "number") setEarnedToday(result.earnedToday);
        if (typeof result.remainingToday === "number") setRemainingToday(result.remainingToday);
        if (typeof result.dailyCap === "number") setDailyCap(result.dailyCap);
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

  const refreshWalletStatus = useCallback(async () => {
    const status = await callWallet("status");
    if (status.ok) {
      if (typeof status.balance === "number") setPointsBalance(status.balance);
      if (typeof status.holdings === "number") setBaroBalance(status.holdings);
      if (typeof status.earnedToday === "number") setEarnedToday(status.earnedToday);
      if (typeof status.remainingToday === "number") setRemainingToday(status.remainingToday);
      if (typeof status.dailyCap === "number") setDailyCap(status.dailyCap);
    }
    return status;
  }, [callWallet]);

  const updateProfile = useCallback(
    async (updates) => {
      if (!userId) return { ok: false, error: "Non authentifié" };
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
    isAnonymous,
    earnedToday,
    remainingToday,
    dailyCap,
    earnPoints,
    redeemReward,
    convertToBaro,
    refreshWalletStatus,
    updateProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
