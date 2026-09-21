import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";
import { API_BASE } from "../config.js";
import { getDeviceId } from "../device.js";

const AppContext = createContext(null);

const GUEST_KEY = "baaro_is_guest";
// FIX NATIF : on passe tout en localStorage pour l'APK
const GUEST_OK_KEY = "baaro_guest_ok";

const DEFAULT_PROFILE = {
  display_name: "Membre BAARO",
  handle: "@membre",
  flag: "🌍",
  bio: "",
};

function safeGet(key, storage = localStorage) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeSet(key, value, storage = localStorage) {
  try { storage.setItem(key, value); } catch {}
}
function safeRemove(key, storage = localStorage) {
  try { storage.removeItem(key); } catch {}
}

function clearGuestFlags() {
  safeRemove(GUEST_KEY);
  // FIX : on clear dans les 2 storages pour migrer les anciens users
  safeRemove(GUEST_OK_KEY);
  try { safeRemove(GUEST_OK_KEY, sessionStorage); } catch {}
}

function isGuestOkThisSession() {
  // FIX NATIF : on check localStorage d'abord, puis sessionStorage par compatibilité
  return safeGet(GUEST_OK_KEY) === "1" || (() => {
    try { return sessionStorage.getItem(GUEST_OK_KEY) === "1"; } catch { return false; }
  })();
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userProfile, setUserProfile] = useState(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [baroBalance, setBaroBalance] = useState(0);
  const [earnedToday, setEarnedToday] = useState(0);
  const [remainingToday, setRemainingToday] = useState(100);
  const [dailyCap, setDailyCap] = useState(100);

  const id = user?.id || null;

  const resetUserData = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserProfile(DEFAULT_PROFILE);
    setPointsBalance(0);
    setBaroBalance(0);
    setEarnedToday(0);
    setRemainingToday(100);
    setDailyCap(100);
    setIsAnonymous(false);
  }, []);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setUserProfile(DEFAULT_PROFILE);
      return null;
    }
    try {
      let { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (!data) {
        const fallback = {
          id: userId,
          display_name: "Membre BAARO",
          handle: `@user_${String(userId).slice(0, 8)}`,
          flag: "🌍",
          bio: "",
          updated_at: new Date().toISOString(),
        };
        const created = await supabase.from("profiles").upsert(fallback, { onConflict: "id" }).select("*").single();
        if (created.error) {
          const inserted = await supabase.from("profiles").insert(fallback).select("*").single();
          if (!inserted.error) data = inserted.data;
        } else {
          data = created.data;
        }
      }
      if (data) {
        const normalized = {...data, id: data.id || userId };
        setProfile(normalized);
        setUserProfile({
          display_name: normalized.display_name || DEFAULT_PROFILE.display_name,
          handle: normalized.handle || DEFAULT_PROFILE.handle,
          flag: normalized.flag || DEFAULT_PROFILE.flag,
          bio: normalized.bio || DEFAULT_PROFILE.bio,
         ...normalized,
        });
        return normalized;
      }
      return null;
    } catch (error) {
      console.error("[BAARO] Erreur chargement profil:", error);
      return null;
    }
  }, []);

  const callWallet = useCallback(async (action, payload = {}) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token) return { ok: false, error: "Non authentifié" };
    try {
      const response = await fetch(`${API_BASE}/api/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ action,...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: data.error || "Erreur serveur" };
      return { ok: true,...data };
    } catch (error) {
      return { ok: false, error: "Impossible de joindre le serveur" };
    }
  }, []);

  const applyWalletStatus = useCallback((status) => {
    if (!status?.ok) return;
    if (typeof status.balance === "number") setPointsBalance(status.balance);
    if (typeof status.holdings === "number") setBaroBalance(status.holdings);
    if (typeof status.earnedToday === "number") setEarnedToday(status.earnedToday);
    if (typeof status.remainingToday === "number") setRemainingToday(status.remainingToday);
    if (typeof status.dailyCap === "number") setDailyCap(status.dailyCap);
  }, []);

  const refreshWalletStatus = useCallback(async () => {
    const status = await callWallet("status");
    applyWalletStatus(status);
    return status;
  }, [callWallet, applyWalletStatus]);

  const registerDevice = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token) return;
    try {
      await fetch(`${API_BASE}/api/register-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        if (error) console.error("[BAARO] Session error:", error);
        if (!mounted) return;
        if (currentSession?.user?.is_anonymous) {
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}
          if (!mounted) return;
          resetUserData();
          setIsGuest(false);
          setIsAnonymous(false);
          return;
        }
        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          setIsGuest(false);
          setIsAnonymous(false);
        } else {
          resetUserData();
          setIsGuest(false);
          setIsAnonymous(false);
        }
      } catch (error) {
        console.error("[BAARO] Erreur initialisation auth:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      if (nextSession?.user?.is_anonymous) {
        if (!isGuestOkThisSession()) {
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}
          if (!mounted) return;
          resetUserData();
          setIsGuest(false);
          setIsAnonymous(false);
          setLoading(false);
          return;
        }
        setSession(nextSession);
        setUser(nextSession.user);
        setIsAnonymous(true);
        setIsGuest(false);
        setLoading(false);
        return;
      }
      if (nextSession?.user) {
        clearGuestFlags();
        setSession(nextSession);
        setUser(nextSession.user);
        setIsGuest(false);
        setIsAnonymous(false);
      } else {
        resetUserData();
        setIsGuest(false);
        setIsAnonymous(false);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [resetUserData]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const loadUserData = async () => {
      await loadProfile(id);
      if (cancelled) return;
      const status = await refreshWalletStatus();
      if (cancelled) return;
      if (status.ok) await registerDevice();
    };
    loadUserData().catch(() => {});
    return () => { cancelled = true; };
  }, [id, loadProfile, refreshWalletStatus, registerDevice]);

  const enableGuestMode = useCallback(() => {
    safeSet(GUEST_OK_KEY, "1");
    safeRemove(GUEST_KEY);
    setIsGuest(true);
    setIsAnonymous(true);
    resetUserData();
  }, [resetUserData]);

  const logout = useCallback(async () => {
    clearGuestFlags();
    try { await supabase.auth.signOut(); } catch {}
    setIsGuest(false);
    setIsAnonymous(false);
    resetUserData();
  }, [resetUserData]);

  const earnPoints = useCallback(async (actionKey, detail = "", referenceId = null) => {
    const result = await callWallet("earn", { actionKey, detail, referenceId });
    applyWalletStatus(result);
    return result;
  }, [callWallet, applyWalletStatus]);

  const redeemReward = useCallback(async (optionId) => {
    const result = await callWallet("redeem", { optionId });
    applyWalletStatus(result);
    return result;
  }, [callWallet, applyWalletStatus]);

  const convertToBaro = useCallback(async (pts) => {
    const result = await callWallet("convert", { pts });
    applyWalletStatus(result);
    return result;
  }, [callWallet, applyWalletStatus]);

  const updateProfile = useCallback(async (updates) => {
    if (!id) return { ok: false, error: "Non authentifié" };
    const { data, error } = await supabase.from("profiles").update(updates).eq("id", id).select("*").single();
    if (error) return { ok: false, error };
    setProfile(data);
    setUserProfile((previous) => ({...previous,...data }));
    return { ok: true, profile: data };
  }, [id]);

  const value = {
    id, user, session, profile, userProfile,
    userId: id, setProfile, setUserProfile,
    isGuest, isAnonymous, loading, enableGuestMode, logout,
    pointsBalance, setPointsBalance, baroBalance, setBaroBalance,
    earnedToday, remainingToday, dailyCap,
    earnPoints, redeemReward, convertToBaro, refreshWalletStatus,
    updateProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp doit être utilisé dans AppProvider");
  return context;
}
