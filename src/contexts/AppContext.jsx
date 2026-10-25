import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../services/supabase.js";
import { API_BASE } from "../config.js";
import { getDeviceId } from "../device.js";

export const AppContext = createContext(null);

const GUEST_KEY = "baaro_is_guest";
const GUEST_OK_KEY = "baaro_guest_ok";
const PROFILE_CACHE_KEY = "baaro_profile_cache_v1";
const DEVICE_REG_PREFIX = "baaro_device_reg:";
const DEVICE_REG_EVERY_MS = 12 * 60 * 60 * 1000; // 12 h

// Champs que le client a le droit d'envoyer. Les champs sensibles
// (is_premium, is_verified, restricted, id, created_at...) sont ignorés.
const EDITABLE_PROFILE_FIELDS = [
  "display_name",
  "handle",
  "flag",
  "bio",
  "avatar_url",
  "cover_url",
  "location",
  "country",
  "first_name",
  "last_name",
  "birth_date",
];

// Lecture profil : colonnes explicites (pas de select "*").
// phone volontairement exclu ici — chargé uniquement dans Réglages si propriétaire.
const PROFILE_SELECT = [
  "id",
  "display_name",
  "handle",
  "flag",
  "bio",
  "avatar_url",
  "cover_url",
  "location",
  "country",
  "registered_country",
  "country_changed_at",
  "country_change_available_at",
  "first_name",
  "last_name",
  "birth_date",
  "is_private",
  "is_verified",
  "created_at",
  "updated_at",
].join(",");

function pickEditable(updates) {
  const out = {};
  for (const key of EDITABLE_PROFILE_FIELDS) {
    if (updates && Object.prototype.hasOwnProperty.call(updates, key)) {
      out[key] = updates[key];
    }
  }
  return out;
}

const DEFAULT_PROFILE = {
  display_name: "Membre BAARO",
  handle: "@membre",
  flag: "🌍",
  bio: "",
};

function safeGet(key, storage = localStorage) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value, storage = localStorage) {
  try {
    storage.setItem(key, value);
  } catch {}
}
function safeRemove(key, storage = localStorage) {
  try {
    storage.removeItem(key);
  } catch {}
}

function clearGuestFlags() {
  safeRemove(GUEST_KEY);
  safeRemove(GUEST_OK_KEY);
  try {
    safeRemove(GUEST_OK_KEY, sessionStorage);
  } catch {}
}

function isGuestOkThisSession() {
  return (
    safeGet(GUEST_OK_KEY) === "1" ||
    (() => {
      try {
        return sessionStorage.getItem(GUEST_OK_KEY) === "1";
      } catch {
        return false;
      }
    })()
  );
}

function toUserProfile(data) {
  return {
    display_name: data.display_name || DEFAULT_PROFILE.display_name,
    handle: data.handle || DEFAULT_PROFILE.handle,
    flag: data.flag || DEFAULT_PROFILE.flag,
    bio: data.bio || DEFAULT_PROFILE.bio,
    avatar_url: data.avatar_url || null,
    cover_url: data.cover_url || null,
    location: data.location || "",
    country: data.country || null,
    registered_country: data.registered_country || null,
    country_changed_at: data.country_changed_at || null,
    country_change_available_at: data.country_change_available_at || null,
    first_name: data.first_name || "",
    last_name: data.last_name || "",
    birth_date: data.birth_date || null,
    is_private: !!data.is_private,
    is_verified: !!data.is_verified,
  };
}

// ---------------------------------------------------------------
// Cache local du profil : l'en-tête (nom, avatar) s'affiche tout de
// suite au démarrage, même sans réseau. Seuls les champs publics sont
// gardés (ni nom civil, ni date de naissance).
// ---------------------------------------------------------------
function readProfileCache(user_id) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.id !== user_id || !parsed.data) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeProfileCache(user_id, profileData) {
  if (!user_id || !profileData) return;
  safeSet(
    PROFILE_CACHE_KEY,
    JSON.stringify({
      id: user_id,
      data: {
        display_name: profileData.display_name,
        handle: profileData.handle,
        flag: profileData.flag,
        bio: profileData.bio,
        avatar_url: profileData.avatar_url,
        cover_url: profileData.cover_url,
        location: profileData.location,
        country: profileData.country,
        is_private: profileData.is_private,
        is_verified: profileData.is_verified,
      },
    })
  );
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userProfile, setUserProfile] = useState(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const id = user?.id || null;

  const resetUserData = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserProfile(DEFAULT_PROFILE);
    setIsAnonymous(false);
  }, []);

  const loadProfile = useCallback(async (user_id) => {
    if (!user_id) {
      setProfile(null);
      setUserProfile(DEFAULT_PROFILE);
      return null;
    }
    try {
      let { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user_id)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        const short = String(user_id).replace(/-/g, "").slice(0, 12);
        const fallback = {
          id: user_id,
          display_name: "Membre BAARO",
          handle: `@user_${short}`,
          flag: "🌍",
          bio: "",
          updated_at: new Date().toISOString(),
        };

        const created = await supabase
          .from("profiles")
          .upsert(fallback, { onConflict: "id", ignoreDuplicates: true })
          .select(PROFILE_SELECT)
          .maybeSingle();

        if (!created.error && created.data) {
          data = created.data;
        } else {
          const reread = await supabase
            .from("profiles")
            .select(PROFILE_SELECT)
            .eq("id", user_id)
            .maybeSingle();

          if (reread.error) throw reread.error;
          data = reread.data || null;

          if (!data && created.error && import.meta.env.DEV) {
            console.error("[BAARO] Création profil échouée:", created.error);
          }
        }
      }
      if (data) {
        const normalized = { ...data, id: data.id || user_id };
        const mapped = toUserProfile(normalized);
        setProfile(normalized);
        setUserProfile(mapped);
        writeProfileCache(user_id, mapped);
        return normalized;
      }
      return null;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("[BAARO] Erreur chargement profil:", error);
      }
      return null;
    }
  }, []);

  // Renvoie true si le serveur a bien enregistré l'appareil.
  const registerDevice = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) return false;
    try {
      const res = await fetch(`${API_BASE}/api/register-device`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();
        if (error && import.meta.env.DEV) {
          console.error("[BAARO] Session error:", error);
        }
        if (!mounted) return;
        if (currentSession?.user?.is_anonymous) {
          if (!isGuestOkThisSession()) {
            try {
              await supabase.auth.signOut({ scope: "local" });
            } catch {}
            if (!mounted) return;
            resetUserData();
            setIsGuest(false);
            setIsAnonymous(false);
            return;
          }
          setSession(currentSession);
          setUser(currentSession.user);
          setIsAnonymous(true);
          setIsGuest(false);
          setLoading(false);
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
        if (import.meta.env.DEV) {
          console.error("[BAARO] Erreur initialisation auth:", error);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initialize();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      if (nextSession?.user?.is_anonymous) {
        if (!isGuestOkThisSession()) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {}
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

    // 1. Affichage immédiat depuis le cache local (puis le réseau met à jour).
    const cached = readProfileCache(id);
    if (cached) {
      setUserProfile((previous) => ({ ...previous, ...cached }));
    }

    const loadUserData = async () => {
      await loadProfile(id);
      if (cancelled) return;

      // 2. Enregistrement de l'appareil : différé de 3 s et au plus une fois
      //    toutes les 12 h (ne ralentit plus chaque ouverture de l'app).
      const regKey = `${DEVICE_REG_PREFIX}${id}`;
      const last = Number(safeGet(regKey) || 0);
      if (Date.now() - last < DEVICE_REG_EVERY_MS) return;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (cancelled) return;

      const ok = await registerDevice();
      if (ok) safeSet(regKey, String(Date.now()));
    };
    loadUserData().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, loadProfile, registerDevice]);

  const enableGuestMode = useCallback(() => {
    safeSet(GUEST_OK_KEY, "1");
    safeRemove(GUEST_KEY);
    setIsGuest(true);
    setIsAnonymous(true);
    resetUserData();
  }, [resetUserData]);

  const logout = useCallback(async () => {
    clearGuestFlags();
    safeRemove(PROFILE_CACHE_KEY);
    try {
      await supabase.auth.signOut();
    } catch {}
    setIsGuest(false);
    setIsAnonymous(false);
    resetUserData();
  }, [resetUserData]);

  const updateProfile = useCallback(
    async (updates) => {
      if (!id) return { ok: false, error: "Non authentifié" };

      const payload = {
        ...pickEditable(updates),
        id,
        updated_at: new Date().toISOString(),
      };

      const saved = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select(PROFILE_SELECT)
        .single();

      if (saved.error) {
        const retry = await supabase
          .from("profiles")
          .upsert(payload, { onConflict: "id" })
          .select(PROFILE_SELECT)
          .single();

        if (retry.error) {
          if (import.meta.env.DEV) {
            console.error(
              "[BAARO] Persistance profil échouée:",
              saved.error,
              retry.error
            );
          }
          return { ok: false, error: retry.error };
        }

        const mappedRetry = toUserProfile(retry.data);
        setProfile(retry.data);
        setUserProfile((previous) => ({
          ...previous,
          ...mappedRetry,
        }));
        writeProfileCache(id, mappedRetry);
        return { ok: true, profile: retry.data };
      }

      const mapped = toUserProfile(saved.data);
      setProfile(saved.data);
      setUserProfile((previous) => ({
        ...previous,
        ...mapped,
      }));
      writeProfileCache(id, mapped);
      return { ok: true, profile: saved.data };
    },
    [id]
  );

  // Valeur mémoïsée : les composants qui utilisent useApp() ne se re-rendent
  // plus à chaque rendu du fournisseur, seulement quand une valeur change.
  const value = useMemo(
    () => ({
      id,
      user,
      session,
      profile,
      userProfile,
      user_id: id,
      setProfile,
      setUserProfile,
      isGuest,
      isAnonymous,
      loading,
      enableGuestMode,
      logout,
      updateProfile,
    }),
    [
      id,
      user,
      session,
      profile,
      userProfile,
      isGuest,
      isAnonymous,
      loading,
      enableGuestMode,
      logout,
      updateProfile,
    ]
  );

  return (
    <AppContext.Provider value={value}>{children}</AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp doit être utilisé dans AppProvider");
  return context;
}

export default AppContext;
