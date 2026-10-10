/// <reference types="vite/client" />
import { NotificationPrefsPanel } from "./NotificationPrefsPanel.jsx";
import NotificationSoundSettings from "./NotificationSoundSettings.jsx";
// src/features/settings/index.tsx
// Réglages BAARO — différenciation marchés émergents + profil + compte + recherche
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  User,
  Palette,
  Globe2,
  Shield,
  LogOut,
  Sparkles,
  Check,
  Wifi,
  WifiOff,
  Bot,
  Languages,
  MapPin,
  Gauge,
  Accessibility,
  Search,
  ShieldCheck,
  FileText,
  RotateCcw,
  Pencil,
  Download,
  Upload,
  KeyRound,
  Copy,
  Smartphone,
  Trash2,
  Volume2,
  ImagePlus,
  X,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { setAppLanguage, SUPPORTED_LANGUAGES } from "../../../i18n.js";
import { supabase } from "../../supabaseClient.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { PushSettings } from "../../components/PushSettings.jsx";
import ProfilePhotosEditor from "../../components/ProfilePhotosEditor.jsx";
import ProfileContactsLinks from "../../components/ProfileContactsLinks.jsx";
import {
  displayHandle,
  normalizeHandle,
  suggestHandle,
  checkHandleAvailable,
  resolveUniqueHandle,
  isHandleUniqueViolation,
} from "../../lib/username.js";
import {
  loadCloudSettings,
  saveCloudSettings,
  saveLocalSettings,
  syncPrivateProfile,
} from "../../lib/appSettings.js";


import {
  STORAGE_KEY,
  APP_VERSION,
  THEMES,
  LANGUAGES,
  BETA_LANGS,
  COUNTRIES,
  CURRENCIES,
  AI_REGIONS,
  MAX_CUSTOM_IMAGE_BYTES,
} from "./constants";
import type { CustomTheme } from "./constants";
import { STRINGS, localeSettings } from "./strings";
import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_SETTINGS,
  loadLocal,
  uiLang,
  applyDocumentLang,
  applyA11y,
} from "./state";
import type { SettingsState } from "./state";
import { ToggleRow, ActionRow, CollapsibleSection, inputStyle } from "./ui";

type Props = {
  user_id?: string | null;
  userProfile?: {
    display_name?: string;
    handle?: string;
    avatar_url?: string;
    cover_url?: string;
    flag?: string;
    bio?: string;
    first_name?: string;
    last_name?: string;
    birth_date?: string | null;
    location?: string;
    country?: string | null;
    registered_country?: string | null;
    country_changed_at?: string | null;
    country_change_available_at?: string | null;
  } | null;
  setUserProfile?: (p: unknown) => void;
  currentTheme?: string;
  onSelectTheme?: (id: string) => void;
  onReplayOnboarding?: () => void;
};

export default function SettingsTab({
  userProfile,
  setUserProfile,
  currentTheme,
  onSelectTheme,
  onReplayOnboarding,
}: Props) {
  const [user, setUser] = useState<{
    id: string;
    email?: string;
    phone?: string;
    is_anonymous?: boolean;
  } | null>(null);
  const [settings, setSettings] = useState<SettingsState>(loadLocal);
  const [countryOpen, setCountryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Profile edit
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [editFlag, setEditFlag] = useState("");
  const [editBio, setEditBio] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Secure guest
  const [secureEmail, setSecureEmail] = useState("");
  const [securePassword, setSecurePassword] = useState("");
  const [secureLoading, setSecureLoading] = useState(false);
  const [secureOauthLoading, setSecureOauthLoading] = useState<string | null>(
    null
  );
  const [secureMessage, setSecureMessage] = useState("");
  const [showLoginFallback, setShowLoginFallback] = useState(false);

  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaFactorCount, setMfaFactorCount] = useState<number | null>(null);
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);
  const [customImageInputEl, setCustomImageInputEl] =
    useState<HTMLInputElement | null>(null);
  const [customUploading, setCustomUploading] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{
    expiresAt?: string | null;
    email?: string | null;
    userAgent?: string;
  } | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true,
    contacts: false,
    secure: true,
    appearance: true,
    language: false,
    region: true,
    data: true,
    ai: false,
    translate: false,
      content: false,
    privacy: false,
    a11y: false,
    mfa: false,
    sessions: false,
    danger: false,
    notifications: true,
    notif_push: true,
    notif_sound: false,
    notif_prefs: false,
    performance: false,
  });

  const lang = uiLang(settings.lang);
  const t = useCallback(
    (key: string) => {
      const a = localeSettings(settings.lang)?.[key];
      if (typeof a === "string") return a;
      const b = STRINGS[lang]?.[key];
      if (typeof b === "string") return b;
      const c = STRINGS.fr[key];
      return typeof c === "string" ? c : key;
    },
    [lang, settings.lang]
  );

  const toggleSection = (id: string) =>
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));

  useEffect(() => {
    saveLocalSettings(settings);
    applyDocumentLang(settings.lang);
    applyA11y(settings);
  }, [settings]);

  useEffect(() => {
    if (currentTheme && currentTheme !== settings.theme) {
      setSettings((s) => ({ ...s, theme: currentTheme }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTheme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data?.user) return;
        setUser({
          id: data.user.id,
          email: data.user.email ?? undefined,
          phone: data.user.phone ?? undefined,
          is_anonymous: data.user.is_anonymous === true,
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name, handle, flag, bio, avatar_url, cover_url, country, registered_country, country_changed_at, country_change_available_at, first_name, last_name, birth_date, location, is_verified, created_at")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!cancelled && profile) {
          setUserProfile?.({ ...(userProfile || {}), ...profile });
          setEditName(profile.display_name || "");
          setEditFirstName(profile.first_name || "");
          setEditLastName(profile.last_name || "");
          setEditBirthDate(profile.birth_date || "");
          setEditLocation(profile.location || "");
          setEditCountry(profile.country || profile.registered_country || "");
          setEditFlag(profile.flag || "🌍");
          setEditBio(profile.bio || "");
        }

        const cloud = await loadCloudSettings(data.user.id);
        if (!cancelled && cloud.ok && cloud.data) {
          setSettings((s) => ({ ...s, ...cloud.data }));
        }
        try {
          const { data: sess } = await supabase.auth.getSession();
          if (!cancelled && sess?.session) {
            setSessionInfo({
              expiresAt: sess.session.expires_at
                ? new Date(sess.session.expires_at * 1000).toLocaleString()
                : null,
              email: data.user.email ?? null,
              userAgent:
                typeof navigator !== "undefined"
                  ? navigator.userAgent.slice(0, 120)
                  : undefined,
            });
          }
        } catch {
          /* ignore */
        }

        if (!data.user.is_anonymous) {
          setMfaLoading(true);
          try {
            const factors = await supabase.auth.mfa.listFactors();
            if (!cancelled) {
              const verified = [
                ...(factors.data?.totp || []),
                ...(factors.data?.phone || []),
              ].filter((f: { status?: string }) => f.status === "verified");
              setMfaFactorCount(verified.length);
            }
          } catch {
            if (!cancelled) setMfaFactorCount(0);
          } finally {
            if (!cancelled) setMfaLoading(false);
          }
        }
      } catch (e) {
        console.log("[settings] Supabase indisponible, mode local", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<SettingsState>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveLocalSettings(next);
    applyA11y(next);

    if (patch.theme && onSelectTheme) onSelectTheme(patch.theme);
    if (
      patch.lang &&
      SUPPORTED_LANGUAGES.includes(String(patch.lang).split("-")[0])
    ) {
      void Promise.resolve(setAppLanguage(patch.lang)).catch(console.warn);
    }

    if (!user?.id) return;

    if ("private_profile" in patch) {
      void syncPrivateProfile(user.id, !!next.private_profile);
    }

    const res = await saveCloudSettings(user.id, next);
    if (!res.ok) {
      console.warn("[settings] cloud save:", res.error);
    }
  }

  // ---- Thème personnalisé (couleurs + image de fond) ----
  const customTheme: CustomTheme = {
    ...DEFAULT_CUSTOM_THEME,
    ...(settings.customTheme || {}),
  };

  const updateCustomTheme = (patch: Partial<CustomTheme>) => {
    void save({ theme: "custom", customTheme: { ...customTheme, ...patch } });
  };

  const handleCustomImage = async (file: File | null) => {
    if (!file || customUploading) return;
    if (!file.type.startsWith("image/")) {
      setMessage(t("custom_image_invalid"));
      return;
    }
    if (file.size > MAX_CUSTOM_IMAGE_BYTES) {
      setMessage(t("custom_image_too_big"));
      return;
    }
    if (!user?.id) {
      setMessage(t("custom_image_login"));
      return;
    }
    setCustomUploading(true);
    setMessage("");
    try {
      const up = await uploadExternalMedia(file, "theme");
      updateCustomTheme({ bgImage: up.url });
    } catch (err) {
      setMessage("❌ " + (err instanceof Error ? err.message : t("custom_image_invalid")));
    } finally {
      setCustomUploading(false);
    }
  };

  const removeCustomImage = () => {
    void save({ theme: "custom", customTheme: { ...customTheme, bgImage: null } });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || profileLoading) return;
    setProfileLoading(true);
    setMessage("");
    try {
      const name = editName.trim() || displayName;
      const desired = normalizeHandle(editHandle, name);

      const availability = await checkHandleAvailable(supabase, desired, user.id);
      let finalHandle = desired;
      let conflictNote = "";

      if (!availability.ok) {
        const resolved = await resolveUniqueHandle(
          supabase,
          desired,
          name,
          user.id
        );
        finalHandle = resolved.handle;
        if (resolved.conflict) {
          conflictNote =
            resolved.message ||
            (availability.suggestion
              ? `${desired} est pris. Identifiant utilisé : ${finalHandle}`
              : availability.reason || "");
        } else if (availability.reason && !availability.suggestion) {
          setMessage("❌ " + availability.reason);
          setProfileLoading(false);
          return;
        }
      }

      const originalCountry = userProfile?.country || userProfile?.registered_country || "";
      const countryChanged = editCountry !== originalCountry;
      const countryChangeAt = userProfile?.country_change_available_at
        ? new Date(userProfile.country_change_available_at).getTime()
        : 0;
      if (countryChanged && countryChangeAt && countryChangeAt > Date.now()) {
        setMessage(`❌ ${t("country_change_wait")} ${new Date(countryChangeAt).toLocaleDateString()}`);
        setProfileLoading(false);
        return;
      }

      const selectedProfileCountry = COUNTRIES.find((c) => c.code === editCountry);
      const derivedFlag = selectedProfileCountry?.flag || "🌍";
      setEditFlag(derivedFlag);

      const profilePayload = {
        id: user.id,
        display_name: name,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        birth_date: editBirthDate || null,
        location: editLocation.trim(),
        country: editCountry || null,
        handle: finalHandle,
        flag: derivedFlag,
        bio: editBio.trim(),
        updated_at: new Date().toISOString(),
      };

      let { error } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("id")
        .single();

      if (error) {
        if (isHandleUniqueViolation(error)) {
          const resolved = await resolveUniqueHandle(
            supabase,
            desired,
            name,
            user.id
          );
          const { error: err2 } = await supabase
            .from("profiles")
            .upsert({ ...profilePayload, handle: resolved.handle }, { onConflict: "id" })
            .select("id")
            .single();
          if (err2) throw err2;
          finalHandle = resolved.handle;
          conflictNote = `Identifiant déjà pris — attribué : ${finalHandle}`;
        } else {
          throw error;
        }
      }

      const updated = {
        ...userProfile,
        display_name: name,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        birth_date: editBirthDate || null,
        location: editLocation.trim(),
        country: editCountry || null,
        flag: derivedFlag,
        handle: finalHandle,
        bio: editBio.trim(),
      };
      setUserProfile?.(updated);
      setEditHandle(finalHandle);
      setIsEditing(false);
      setMessage(
        conflictNote
          ? `✅ Profil mis à jour. ${conflictNote}`
          : t("profile_saved")
      );
    } catch (err) {
      console.error(err);
      setMessage(
        isHandleUniqueViolation(err)
          ? "❌ Cet identifiant vient d'être pris. Choisis-en un autre."
          : t("profile_error")
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSecureWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secureLoading) return;
    setSecureLoading(true);
    setSecureMessage("");
    setShowLoginFallback(false);
    try {
      const { error } = await supabase.auth.updateUser({
        email: secureEmail,
        password: securePassword,
      });
      if (error) {
        if (error.message?.toLowerCase().includes("already been registered")) {
          setSecureMessage(
            lang === "fr"
              ? "⚠️ Un compte existe déjà avec cet e-mail."
              : "⚠️ An account already exists with this email."
          );
          setShowLoginFallback(true);
          return;
        }
        throw error;
      }
      setSecureMessage(t("secure_check_mail"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setSecureMessage("❌ " + msg);
    } finally {
      setSecureLoading(false);
    }
  };

  const handleLoginExisting = async () => {
    if (secureLoading) return;
    setSecureLoading(true);
    setSecureMessage("");
    try {
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({
        email: secureEmail,
        password: securePassword,
      });
      if (error) throw error;
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setSecureMessage("❌ " + msg);
    } finally {
      setSecureLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (secureLoading || !secureEmail) return;
    setSecureLoading(true);
    setSecureMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(secureEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setSecureMessage(t("reset_sent"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setSecureMessage("❌ " + msg);
    } finally {
      setSecureLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "facebook") => {
    if (secureOauthLoading) return;
    setSecureOauthLoading(provider);
    setSecureMessage("");
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setSecureMessage("❌ " + msg);
      setSecureOauthLoading(null);
    }
  };

  const handleResetPrefs = () => {
    if (!window.confirm(t("reset_confirm"))) return;
    setSettings({ ...DEFAULT_SETTINGS, lang: settings.lang });
    setMessage(t("reset_done"));
  };

  const buildExportPayload = () => ({
    app: "BAARO",
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    settings,
  });

  const handleExportPrefs = () => {
    try {
      const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `baaro-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(t("export_done"));
    } catch {
      setMessage(t("import_error"));
    }
  };

  const handleCopyPrefs = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(buildExportPayload(), null, 2)
      );
      setMessage(t("copy_done"));
    } catch {
      setMessage(t("import_error"));
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = parsed?.settings && typeof parsed.settings === "object"
        ? parsed.settings
        : parsed;
      if (!incoming || typeof incoming !== "object") throw new Error("invalid");
      const next = { ...DEFAULT_SETTINGS, ...incoming };
      setSettings(next);
      setMessage(t("import_done"));
    } catch {
      setMessage(t("import_error"));
    }
  };

  const clearLocalAuthData = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("baaro_settings_v22");
      localStorage.removeItem("baaro_settings_v21");
      localStorage.removeItem("baaro_settings_v20");
    } catch {
      /* ignore */
    }
  };

  const handleLogout = async () => {
    if (!window.confirm(t("logout_confirm"))) return;
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
    }
    clearLocalAuthData();
    window.location.href = "/";
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(t("logout_all_confirm"))) return;
    setAccountBusy(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      setMessage(t("logout_all_done"));
      clearLocalAuthData();
      setTimeout(() => {
        window.location.href = "/";
      }, 600);
    } catch (err) {
      console.error(err);
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      clearLocalAuthData();
      window.location.href = "/";
    } finally {
      setAccountBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm(t("delete_confirm_1"))) return;
    if (!window.confirm(t("delete_confirm_2"))) return;
    setAccountBusy(true);
    setMessage("");
    try {
      const { error: rpcError } = await supabase.rpc("delete_own_account");
      if (rpcError) { throw rpcError; }
      if (false) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            await fetch("/api/delete-account", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
            });
          }
        } catch {
          /* endpoint may not exist yet */
        }
      }
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        await supabase.auth.signOut();
      }
      clearLocalAuthData();
      setMessage(t("delete_done"));
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (err) {
      console.error(err);
      setMessage(t("delete_error"));
    } finally {
      setAccountBusy(false);
    }
  };

  const displayName =
    userProfile?.display_name ||
    user?.email?.split("@")[0] ||
    t("guest");
  const handle = displayHandle(
    userProfile?.handle,
    userProfile?.display_name || user?.email?.split("@")[0] || "baaro"
  );
  const avatarUrl =
    userProfile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=1A2740`;
  const activeTheme = settings.theme;
  const countryMeta =
    COUNTRIES.find((c) => c.code === settings.country) ||
    COUNTRIES[COUNTRIES.length - 1];
  const isAnonymous = user?.is_anonymous === true;
  const selectedLangMeta = LANGUAGES.find((l) => l.code === settings.lang);

  const q = query.trim().toLowerCase();
  const match = useCallback(
    (...keys: string[]) => {
      if (!q) return true;
      return keys.some((k) => {
        const label = t(k).toLowerCase();
        return label.includes(q) || k.includes(q);
      });
    },
    [q, t]
  );

  const visible = useMemo(
    () => ({
      profile: match("profile_section", "display_name", "bio", "contacts_links"),
      secure: isAnonymous && match("secure_account", "email", "password"),
      appearance: match(
        "appearance",
        "theme",
        "theme_custom",
        "custom_bg",
        "custom_accent",
        "custom_image"
      ),
      language: match("language", "lang_beta_hint"),
      region: match("region", "country", "currency"),
      data: match(
        "data_network",
        "data_saver",
        "autoplay_video",
        "offline_sync"
      ),
      performance: match(
        "performance_section",
        "performance_desc",
        "smart_prefetch",
        "battery_saver",
        "low_bandwidth_mode",
        "local_cache",
        "privacy_ai"
      ),
      ai: match("ai_section", "ai_region", "ai_suggest"),
      translate: match("translate_section", "auto_translate", "translate_media"),
      content: match("content_section", "prefer_debates", "prefer_local"),
      privacy: match(
        "privacy",
        "private_profile",
        "block_screenshots",
        "biometric"
      ),
      a11y: match("a11y", "large_text", "reduce_motion"),
      sessions: match(
        "sessions_section",
        "logout_all",
        "session_current",
        "session_device"
      ),
      danger: match("delete_account", "delete_account_desc"),
      notifications: match(
        "notifications_section",
        "notifications_desc",
        "sound_settings",
        "push_title",
        "prefs_title"
      ),
    }),
    [match, isAnonymous, q]
  );

  const anyVisible = Object.values(visible).some(Boolean);

  if (showPrivacy) {
    return (
      <div
        className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-28 px-1"
        style={{ color: COLORS.ivory }}
      >
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FileText size={22} style={{ color: COLORS.teal }} />
          {t("privacy_policy")}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: COLORS.muted }}>
          {t("privacy_body")}
        </p>
        <button
          type="button"
          onClick={() => setShowPrivacy(false)}
          className="w-full py-3 rounded-xl text-sm font-semibold border"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderTeal,
            color: COLORS.teal,
          }}
        >
          {t("privacy_back")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-28 px-1"
      style={{ color: COLORS.ivory, minHeight: "60vh" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl border text-sm font-bold"
          style={{
            background: COLORS.surface,
            borderColor: COLORS.borderTeal,
            color: COLORS.teal,
          }}
        >
          B
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="text-lg font-semibold leading-none"
            style={{ color: COLORS.ivory }}
          >
            {t("title")}
          </h2>
          <p className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
            {user ? t("subtitle_connected") : t("subtitle_local")} ·{" "}
            {t("vs_competitors")}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: COLORS.muted }}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none border"
          style={inputStyle}
        />
      </div>

      {message && (
        <div
          className="p-3 rounded-xl text-sm"
          style={{
            background: message.startsWith("✅")
              ? "rgba(45,191,166,0.15)"
              : "rgba(239,68,68,0.15)",
            color: message.startsWith("✅") ? COLORS.teal : "#F87171",
          }}
        >
          {message}
        </div>
      )}

      {!anyVisible && (
        <p className="text-sm text-center py-8" style={{ color: COLORS.muted }}>
          {t("no_results")}
        </p>
      )}

      {/* Profile card + edit */}
      {visible.profile && (
        <CollapsibleSection
          id="profile"
          icon={User}
          title={t("profile_section")}
          accent={COLORS.gold}
          open={openSections.profile}
          onToggle={() => toggleSection("profile")}
        >
          {user?.id && (
            <ProfilePhotosEditor
              user_id={user.id}
              profile={userProfile}
              onUpdated={(patch: Record<string, unknown>) => {
                setUserProfile?.({
                  ...(userProfile || {}),
                  ...patch,
                });
              }}
            />
          )}
          <div className="flex items-center gap-3">
            <img
              src={
                userProfile?.avatar_url ||
                avatarUrl
              }
              alt=""
              className="h-14 w-14 rounded-2xl object-cover"
              style={{ border: `1px solid ${COLORS.border}` }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">
                {userProfile?.flag ? `${userProfile.flag} ` : ""}
                {displayName}
              </p>
              <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                {handle}
              </p>
            </div>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setEditName(userProfile?.display_name || displayName);
                setEditFirstName(userProfile?.first_name || "");
                setEditLastName(userProfile?.last_name || "");
                setEditBirthDate(userProfile?.birth_date || "");
                setEditLocation(userProfile?.location || "");
                setEditCountry(userProfile?.country || userProfile?.registered_country || "");
                setEditHandle(
                  displayHandle(
                    userProfile?.handle,
                    userProfile?.display_name || displayName
                  )
                );
                setEditFlag(userProfile?.flag || "🌍");
                setEditBio(userProfile?.bio || "");
                setIsEditing(true);
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Pencil size={14} />
              {t("edit_profile")}
            </button>
          ) : (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder={t("first_name")}
                  maxLength={60}
                  className="w-full rounded-xl p-3 text-sm outline-none border"
                  style={inputStyle}
                />
                <input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder={t("last_name")}
                  maxLength={60}
                  className="w-full rounded-xl p-3 text-sm outline-none border"
                  style={inputStyle}
                />
              </div>
              <input
                value={editName}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditName(v);
                  const h = (editHandle || "").replace(/^@/, "");
                  if (!h || h === "membre" || h === "member" || h.startsWith("user_")) {
                    setEditHandle(suggestHandle(v));
                  }
                }}
                placeholder={t("display_name")}
                className="w-full rounded-xl p-3 text-sm outline-none border"
                style={inputStyle}
              />
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>
                  {t("handle_label")}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: COLORS.gold }}>@</span>
                  <input
                    value={(editHandle || "").replace(/^@/, "")}
                    onChange={(e) => setEditHandle(e.target.value)}
                    onBlur={async () => {
                      if (!user?.id || !editHandle?.trim()) return;
                      try {
                        const result = await checkHandleAvailable(
                          supabase,
                          editHandle,
                          user.id
                        );
                        if (!result.ok) {
                          setMessage(
                            "⚠️ " +
                              result.reason +
                              (result.suggestion
                                ? ` Suggestion : ${result.suggestion}`
                                : "")
                          );
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    placeholder="amadou_traore"
                    maxLength={30}
                    className="w-full rounded-xl p-3 text-sm outline-none border"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ ...inputStyle, opacity: 0.9 }}>
                {t("flag_emoji")}: {editFlag || "🌍"} — automatiquement lié au pays actuel
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>{t("birth_date")}</label>
                  <input
                    type="date"
                    value={editBirthDate}
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().slice(0, 10)}
                    min="1900-01-01"
                    onChange={(e) => setEditBirthDate(e.target.value)}
                    className="w-full rounded-xl p-3 text-sm outline-none border"
                    style={inputStyle}
                  />
                </div>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder={t("location")}
                  maxLength={120}
                  className="w-full rounded-xl p-3 text-sm outline-none border self-end"
                  style={inputStyle}
                />
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border }}>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>
                  {user?.email ? t("account_email") : t("account_phone")}
                </label>
                <input
                  value={user?.email || user?.phone || ""}
                  readOnly
                  disabled
                  className="w-full rounded-xl p-3 text-sm border opacity-80"
                  style={inputStyle}
                />
                <p className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
                  {user?.email
                    ? "E-mail d'authentification du compte, géré par Supabase Auth."
                    : user?.phone
                    ? "Numéro de téléphone d'authentification du compte, géré par Supabase Auth."
                    : "Aucune méthode d'authentification stable détectée sur ce compte."}
                </p>
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border }}>
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>{t("current_country")}</label>
                <select
                  value={editCountry}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditCountry(value);
                    setEditFlag(COUNTRIES.find((c) => c.code === value)?.flag || "🌍");
                  }}
                  className="w-full rounded-xl p-3 text-sm outline-none border"
                  style={inputStyle}
                >
                  <option value="">{t("choose_country")}</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.label}</option>)}
                </select>
                <p className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
                  {userProfile?.registered_country ? `${t("registered_country")} : ${userProfile.registered_country}. ` : ""}
                  {userProfile?.country_change_available_at && new Date(userProfile.country_change_available_at).getTime() > Date.now()
                    ? `${t("country_change_wait")} ${new Date(userProfile.country_change_available_at).toLocaleDateString()}`
                    : t("country_change_ready")}
                </p>
              </div>

              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder={t("bio")}
                rows={2}
                maxLength={500}
                className="w-full rounded-xl p-3 text-sm outline-none border resize-none"
                style={inputStyle}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
                  style={{ background: COLORS.gold, color: COLORS.bg }}
                >
                  {profileLoading ? "…" : t("save_profile")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold"
                  style={{ background: COLORS.surface2, color: COLORS.muted }}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}
          {user?.id && !isAnonymous && (
            <CollapsibleSection
              id="contacts"
              icon={Globe2}
              title={t("contacts_links")}
              desc="WhatsApp, liens, téléphone"
              accent={COLORS.teal}
              open={openSections.contacts || !!q}
              onToggle={() => toggleSection("contacts")}
            >
              <ProfileContactsLinks user_id={user.id} />
            </CollapsibleSection>
          )}
        </CollapsibleSection>
      )}

      {/* Secure guest account */}
      {visible.secure && (
        <CollapsibleSection
          id="secure"
          icon={ShieldCheck}
          title={t("secure_account")}
          desc={t("secure_account_desc")}
          accent={COLORS.gold}
          open={openSections.secure}
          onToggle={() => toggleSection("secure")}
        >
          {secureMessage && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                background: secureMessage.startsWith("✅")
                  ? "rgba(45,191,166,0.15)"
                  : secureMessage.startsWith("⚠️")
                    ? "rgba(217,174,82,0.15)"
                    : "rgba(239,68,68,0.15)",
                color: secureMessage.startsWith("✅")
                  ? COLORS.teal
                  : secureMessage.startsWith("⚠️")
                    ? COLORS.gold
                    : "#F87171",
              }}
            >
              {secureMessage}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={!!secureOauthLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            >
              {secureOauthLoading === "google" ? "…" : t("link_google")}
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("facebook")}
              disabled={!!secureOauthLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "#1877F2", color: "#fff" }}
            >
              {secureOauthLoading === "facebook" ? "…" : t("link_facebook")}
            </button>
          </div>
          <form onSubmit={handleSecureWithEmail} className="flex flex-col gap-2">
            <input
              type="email"
              required
              value={secureEmail}
              onChange={(e) => {
                setSecureEmail(e.target.value);
                setShowLoginFallback(false);
              }}
              placeholder={t("email")}
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={inputStyle}
            />
            <input
              type="password"
              required
              minLength={6}
              value={securePassword}
              onChange={(e) => setSecurePassword(e.target.value)}
              placeholder={t("password")}
              className="w-full rounded-xl p-3 text-sm outline-none border"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={secureLoading}
              className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.teal} 100%)`,
                color: COLORS.bg,
              }}
            >
              {secureLoading ? "…" : t("secure_with_email")}
            </button>
          </form>
          {showLoginFallback && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleLoginExisting}
                disabled={secureLoading}
                className="w-full py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
              >
                {t("login_existing")}
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-xs underline text-center"
                style={{ color: COLORS.muted }}
              >
                {t("forgot_password")}
              </button>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* 🔔 NOTIFICATIONS (Push + Son + Préférences) */}
      {visible.notifications && (
        <CollapsibleSection
          id="notifications"
          icon={Volume2}
          title={t("notifications_section")}
          desc={t("notifications_desc")}
          accent={COLORS.gold}
          open={openSections.notifications}
          onToggle={() => toggleSection("notifications")}
        >
          <CollapsibleSection id="notif_push" icon={Smartphone} title={t("push_title")} accent={COLORS.teal} open={openSections.notif_push} onToggle={() => toggleSection("notif_push")}>
            <PushSettings />
          </CollapsibleSection>
          <CollapsibleSection id="notif_sound" icon={Volume2} title={t("sound_settings")} desc={t("sound_settings_desc")} accent={COLORS.gold} open={openSections.notif_sound} onToggle={() => toggleSection("notif_sound")}>
            <NotificationSoundSettings C={COLORS} />
          </CollapsibleSection>
          <CollapsibleSection id="notif_prefs" icon={Bot} title={t("prefs_title")} accent={COLORS.teal} open={openSections.notif_prefs} onToggle={() => toggleSection("notif_prefs")}>
            <NotificationPrefsPanel />
          </CollapsibleSection>
        </CollapsibleSection>
      )}

      {/* Appearance */}
      {visible.appearance && (
        <CollapsibleSection
          id="appearance"
          icon={Palette}
          title={t("appearance")}
          accent={COLORS.teal}
          open={openSections.appearance}
          onToggle={() => toggleSection("appearance")}
        >
          <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
            {t("theme")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((th) => {
              const selected = activeTheme === th.id;
              const isCustom = th.id === "custom";
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => save({ theme: th.id })}
                  className="p-3 rounded-xl border text-center text-xs font-bold"
                  style={{
                    background: isCustom ? customTheme.bgColor : th.bg,
                    backgroundImage:
                      isCustom && customTheme.bgImage
                        ? `url("${customTheme.bgImage}")`
                        : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderColor: selected ? COLORS.gold : COLORS.border,
                    color: th.id === "light" ? "#0B1220" : COLORS.ivory,
                  }}
                >
                  {t(th.labelKey)}
                  {selected && (
                    <Check
                      size={12}
                      className="inline ml-1"
                      style={{ color: COLORS.gold }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {activeTheme === "custom" && (
            <div
              className="rounded-xl border p-3 flex flex-col gap-3"
              style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
            >
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="baaro-custom-bg"
                  className="text-xs font-semibold"
                  style={{ color: COLORS.muted }}
                >
                  {t("custom_bg")}
                </label>
                <input
                  id="baaro-custom-bg"
                  type="color"
                  value={customTheme.bgColor}
                  onChange={(e) => updateCustomTheme({ bgColor: e.target.value })}
                  className="h-9 w-14 rounded-lg border cursor-pointer bg-transparent"
                  style={{ borderColor: COLORS.border }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="baaro-custom-accent"
                  className="text-xs font-semibold"
                  style={{ color: COLORS.muted }}
                >
                  {t("custom_accent")}
                </label>
                <input
                  id="baaro-custom-accent"
                  type="color"
                  value={customTheme.accent}
                  onChange={(e) => updateCustomTheme({ accent: e.target.value })}
                  className="h-9 w-14 rounded-lg border cursor-pointer bg-transparent"
                  style={{ borderColor: COLORS.border }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
                  {t("custom_image")}
                </p>
                {customTheme.bgImage && (
                  <div
                    className="h-20 w-full rounded-xl border"
                    style={{
                      borderColor: COLORS.border,
                      backgroundImage: `url("${customTheme.bgImage}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => customImageInputEl?.click()}
                    disabled={customUploading}
                    className="disabled:opacity-50 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border"
                    style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}
                  >
                    <ImagePlus size={14} />
                    {customUploading ? "…" : t("custom_upload")}
                  </button>
                  {customTheme.bgImage && (
                    <button
                      type="button"
                      onClick={removeCustomImage}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border"
                      style={{ borderColor: COLORS.border, color: "#F87171" }}
                    >
                      <X size={14} />
                      {t("custom_remove")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <input
            ref={setCustomImageInputEl}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              handleCustomImage(f);
              e.target.value = "";
            }}
          />
        </CollapsibleSection>
      )}

      {/* Language */}
      {visible.language && (
        <CollapsibleSection
          id="language"
          icon={Globe2}
          title={t("language")}
          accent={COLORS.gold}
          open={openSections.language || !!q}
          onToggle={() => toggleSection("language")}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LANGUAGES.map((l) => {
              const selected = settings.lang === l.code;
              const isBeta = BETA_LANGS.has(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => save({ lang: l.code })}
                  className="py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5"
                  style={{
                    background: selected ? COLORS.goldGlow : COLORS.surface2,
                    borderColor: selected ? COLORS.borderGold : COLORS.border,
                    color: selected ? COLORS.gold : COLORS.ivory,
                  }}
                >
                  <span>{l.label}</span>
                  {isBeta && (
                    <span
                      className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "rgba(217,174,82,0.18)",
                        color: COLORS.gold,
                      }}
                    >
                      {t("beta_badge")}
                    </span>
                  )}
                  
                  
                </button>
              );
            })}
          </div>
          {BETA_LANGS.has(settings.lang) && (
            <p className="text-[11px] leading-relaxed" style={{ color: COLORS.gold }}>
              {t("lang_beta_hint")}
            </p>
          )}
          {selectedLangMeta && !selectedLangMeta.fullUi && (
            <p className="text-[11px] leading-relaxed" style={{ color: COLORS.muted }}>
              {t("lang_partial_hint")}
            </p>
          )}
        </CollapsibleSection>
      )}

      {/* Region */}
      {visible.region && (
        <CollapsibleSection
          id="region"
          icon={MapPin}
          title={t("region")}
          desc={t("region_desc")}
          accent={COLORS.gold}
          open={openSections.region || !!q}
          onToggle={() => toggleSection("region")}
        >
          <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
            {t("country")}
          </p>
          <button
            type="button"
            onClick={() => setCountryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm"
            style={inputStyle}
          >
            <span>
              {countryMeta.flag} {countryMeta.label}
            </span>
            <span style={{ color: COLORS.muted }}>
              {countryOpen ? "▲" : "▼"}
            </span>
          </button>
          {countryOpen && (
            <div
              className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto rounded-xl p-2 border"
              style={{ background: COLORS.bg, borderColor: COLORS.border }}
            >
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    save({ country: c.code });
                    setCountryOpen(false);
                  }}
                  className="text-left text-xs px-2 py-2 rounded-lg"
                  style={{
                    background:
                      settings.country === c.code
                        ? COLORS.goldGlow
                        : "transparent",
                    color:
                      settings.country === c.code ? COLORS.gold : COLORS.ivory,
                  }}
                >
                  {c.flag} {c.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
            {t("currency")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CURRENCIES.map((c) => {
              const selected = settings.currency === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => save({ currency: c.code })}
                  className="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold"
                  style={{
                    background: selected ? COLORS.tealGlow : COLORS.surface2,
                    borderColor: selected ? COLORS.borderTeal : COLORS.border,
                    color: selected ? COLORS.teal : COLORS.ivory,
                  }}
                >
                  {c.code}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Data */}
      {visible.data && (
        <CollapsibleSection
          id="data"
          icon={settings.data_saver ? WifiOff : Wifi}
          title={t("data_network")}
          desc={t("data_network_desc")}
          accent={COLORS.teal}
          open={openSections.data || !!q}
          onToggle={() => toggleSection("data")}
        >
          <ToggleRow
            title={t("data_saver")}
            desc={t("data_saver_desc")}
            enabled={settings.data_saver}
            onChange={(v) => save({ data_saver: v })}
          />
          <ToggleRow
            title={t("autoplay_video")}
            desc={t("autoplay_video_desc")}
            enabled={settings.autoplay_video}
            onChange={(v) => save({ autoplay_video: v })}
          />
          <ToggleRow
            title={t("offline_sync")}
            desc={t("offline_sync_desc")}
            enabled={settings.offline_sync}
            onChange={(v) => save({ offline_sync: v })}
          />
        </CollapsibleSection>
      )}

      {/* Performance & innovation */}
      {visible.performance && (
        <CollapsibleSection id="performance" icon={Gauge} title={t("performance_section")} desc={t("performance_desc")} accent={COLORS.teal} open={openSections.performance || !!q} onToggle={() => toggleSection("performance")}>
          <ToggleRow title={t("smart_prefetch")} desc={t("smart_prefetch_desc")} enabled={settings.smart_prefetch} onChange={(v) => save({ smart_prefetch: v })} />
          <ToggleRow title={t("battery_saver")} desc={t("battery_saver_desc")} enabled={settings.battery_saver} onChange={(v) => save({ battery_saver: v })} />
          <ToggleRow title={t("low_bandwidth_mode")} desc={t("low_bandwidth_mode_desc")} enabled={settings.low_bandwidth_mode} onChange={(v) => save({ low_bandwidth_mode: v })} />
          <ToggleRow title={t("local_cache")} desc={t("local_cache_desc")} enabled={settings.local_cache} onChange={(v) => save({ local_cache: v })} />
          <ToggleRow title={t("privacy_ai")} desc={t("privacy_ai_desc")} enabled={settings.privacy_ai} onChange={(v) => save({ privacy_ai: v })} />
        </CollapsibleSection>
      )}

      {/* AI */}
      {visible.ai && (
        <CollapsibleSection
          id="ai"
          icon={Bot}
          title={t("ai_section")}
          desc={t("ai_section_desc")}
          accent={COLORS.purple}
          open={openSections.ai || !!q}
          onToggle={() => toggleSection("ai")}
        >
          <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
            {t("ai_region")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {AI_REGIONS.map((r) => {
              const selected = settings.ai_region === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => save({ ai_region: r.id })}
                  className="py-2.5 rounded-xl border text-xs font-bold"
                  style={{
                    background: selected
                      ? "rgba(139,92,246,0.2)"
                      : COLORS.surface2,
                    borderColor: selected ? COLORS.purple : COLORS.border,
                    color: selected ? "#C4B5FD" : COLORS.ivory,
                  }}
                >
                  {t(r.labelKey)}
                </button>
              );
            })}
          </div>
          <ToggleRow
            title={t("ai_suggest")}
            desc={t("ai_suggest_desc")}
            enabled={settings.ai_suggest}
            onChange={(v) => save({ ai_suggest: v })}
          />
        </CollapsibleSection>
      )}

      {/* Translate */}
      {visible.translate && (
        <CollapsibleSection
          id="translate"
          icon={Languages}
          title={t("translate_section")}
          desc={t("translate_section_desc")}
          accent={COLORS.teal}
          open={openSections.translate || !!q}
          onToggle={() => toggleSection("translate")}
        >
          <ToggleRow
            title={t("auto_translate")}
            desc={t("auto_translate_desc")}
            enabled={settings.auto_translate}
            onChange={(v) => save({ auto_translate: v })}
          />
          <ToggleRow
            title={t("translate_media")}
            desc={t("translate_media_desc")}
            enabled={settings.translate_media}
            onChange={(v) => save({ translate_media: v })}
          />
        </CollapsibleSection>
      )}

      {/* Content */}
      {visible.content && (
        <CollapsibleSection
          id="content"
          icon={Gauge}
          title={t("content_section")}
          desc={t("content_section_desc")}
          accent={COLORS.gold}
          open={openSections.content || !!q}
          onToggle={() => toggleSection("content")}
        >
          <ToggleRow
            title={t("prefer_debates")}
            desc={t("prefer_debates_desc")}
            enabled={settings.prefer_debates}
            onChange={(v) => save({ prefer_debates: v })}
          />
          <ToggleRow
            title={t("prefer_local")}
            desc={t("prefer_local_desc")}
            enabled={settings.prefer_local}
            onChange={(v) => save({ prefer_local: v })}
          />
        </CollapsibleSection>
      )}

      {/* Privacy */}
      {visible.privacy && (
        <CollapsibleSection
          id="privacy"
          icon={Shield}
          title={t("privacy")}
          accent={COLORS.gold}
          open={openSections.privacy || !!q}
          onToggle={() => toggleSection("privacy")}
        >
          <ToggleRow
            title={t("private_profile")}
            desc={t("private_profile_desc")}
            enabled={settings.private_profile}
            onChange={(v) => save({ private_profile: v })}
          />
          <ToggleRow
            title={t("block_screenshots")}
            desc={t("block_screenshots_desc")}
            enabled={settings.block_screenshots}
            onChange={(v) => save({ block_screenshots: v })}
          />
          <ToggleRow
            title={t("biometric")}
            desc={t("biometric_desc")}
            enabled={settings.biometric}
            onChange={(v) => save({ biometric: v })}
          />
        </CollapsibleSection>
      )}

      {/* 2FA status (affichage) */}
      {(visible.privacy || match("mfa_section", "mfa_enabled")) && (
        <CollapsibleSection
          id="mfa"
          icon={KeyRound}
          title={t("mfa_section")}
          desc={t("mfa_desc")}
          accent={COLORS.teal}
          open={openSections.mfa || !!q}
          onToggle={() => toggleSection("mfa")}
        >
          {!user || isAnonymous ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {t("mfa_guest")}
            </p>
          ) : mfaLoading ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {t("mfa_loading")}
            </p>
          ) : (
            <div
              className="rounded-xl px-4 py-3 border text-sm font-semibold"
              style={{
                background:
                  (mfaFactorCount || 0) > 0
                    ? "rgba(45,191,166,0.12)"
                    : "rgba(255,255,255,0.04)",
                borderColor:
                  (mfaFactorCount || 0) > 0
                    ? COLORS.borderTeal
                    : COLORS.border,
                color:
                  (mfaFactorCount || 0) > 0 ? COLORS.teal : COLORS.muted,
              }}
            >
              {(mfaFactorCount || 0) > 0
                ? `${t("mfa_enabled")} · ${mfaFactorCount} ${t("mfa_factors")}`
                : t("mfa_disabled")}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* A11y */}
      {visible.a11y && (
        <CollapsibleSection
          id="a11y"
          icon={Accessibility}
          title={t("a11y")}
          accent={COLORS.teal}
          open={openSections.a11y || !!q}
          onToggle={() => toggleSection("a11y")}
        >
          <ToggleRow
            title={t("large_text")}
            desc={t("large_text_desc")}
            enabled={settings.large_text}
            onChange={(v) => save({ large_text: v })}
          />
          <ToggleRow
            title={t("reduce_motion")}
            desc={t("reduce_motion_desc")}
            enabled={settings.reduce_motion}
            onChange={(v) => save({ reduce_motion: v })}
          />
        </CollapsibleSection>
      )}

      {/* Sessions */}
      {visible.sessions && (
        <CollapsibleSection
          id="sessions"
          icon={Smartphone}
          title={t("sessions_section")}
          desc={t("sessions_desc")}
          accent={COLORS.teal}
          open={openSections.sessions || !!q}
          onToggle={() => toggleSection("sessions")}
        >
          {sessionInfo ? (
            <div
              className="rounded-xl border p-3 text-xs space-y-1"
              style={{ background: COLORS.surface2, borderColor: COLORS.border }}
            >
              <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                {t("session_current")}
              </p>
              {sessionInfo.email && (
                <p style={{ color: COLORS.muted }}>{sessionInfo.email}</p>
              )}
              <p style={{ color: COLORS.muted }}>
                {t("session_device")}:{" "}
                {sessionInfo.userAgent || t("session_unknown")}
              </p>
              <p style={{ color: COLORS.muted }}>
                {t("session_expires")}:{" "}
                {sessionInfo.expiresAt || t("session_unknown")}
              </p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {t("session_unknown")}
            </p>
          )}
          <button
            type="button"
            disabled={accountBusy || !user}
            onClick={handleLogoutAll}
            className="w-full py-2.5 rounded-xl text-sm font-bold border disabled:opacity-50"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            {t("logout_all")}
          </button>
        </CollapsibleSection>
      )}

      {/* Danger zone — suppression compte */}
      {visible.danger && user && !isAnonymous && (
        <CollapsibleSection
          id="danger"
          icon={Trash2}
          title={t("delete_account")}
          desc={t("delete_account_desc")}
          accent="#F87171"
          open={openSections.danger || !!q}
          onToggle={() => toggleSection("danger")}
        >
          <ActionRow
            icon={Trash2}
            label={t("delete_account")}
            onClick={handleDeleteAccount}
            disabled={accountBusy}
            tone="danger"
          />
        </CollapsibleSection>
      )}

      <section
        className="rounded-2xl border overflow-hidden"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
      >
        {onReplayOnboarding && (
          <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
            <ActionRow
              icon={Sparkles}
              label={t("replay_onboarding")}
              onClick={onReplayOnboarding}
              tone="gold"
            />
          </div>
        )}
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow
            icon={FileText}
            label={t("privacy_policy")}
            onClick={() => setShowPrivacy(true)}
          />
        </div>
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow icon={Download} label={t("export_prefs")} onClick={handleExportPrefs} />
        </div>
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow
            icon={Upload}
            label={t("import_prefs")}
            onClick={() => fileInputEl?.click()}
          />
        </div>
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow icon={Copy} label={t("copy_prefs")} onClick={handleCopyPrefs} />
        </div>
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow icon={RotateCcw} label={t("reset_prefs")} onClick={handleResetPrefs} />
        </div>
        <div className="px-4 border-t first:border-t-0" style={{ borderColor: COLORS.border }}>
          <ActionRow icon={LogOut} label={t("logout")} onClick={handleLogout} tone="danger" />
        </div>
      </section>
      <input
        ref={setFileInputEl}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          handleImportFile(f);
          e.target.value = "";
        }}
      />

      <p className="text-center text-[10px] py-1" style={{ color: COLORS.muted }}>
        {t("version")} {APP_VERSION}
      </p>
    </div>
  );
}
