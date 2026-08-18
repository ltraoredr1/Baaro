import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import {
  isPushSupported,
  getPermissionState,
  enablePushNotifications,
  disablePushNotifications,
} from "../lib/pushNotifications.js";

/**
 * Bloc réglages notifications — à placer dans SettingsTab.
 */
export function PushSettings() {
  const { showToast } = useToast();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    setPermission(getPermissionState());
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    const res = await enablePushNotifications();
    setLoading(false);
    setPermission(getPermissionState());

    if (res.ok) {
      showToast("Notifications activées", "success");
    } else {
      showToast(res.error || "Impossible d'activer", "error");
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    const res = await disablePushNotifications();
    setLoading(false);
    setPermission(getPermissionState());

    if (res.ok) {
      showToast("Notifications désactivées", "info");
    } else {
      showToast(res.error || "Erreur", "error");
    }
  };

  if (!supported) {
    return (
      <div
        className="rounded-2xl p-4 border text-xs"
        style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.muted }}
      >
        Les notifications push ne sont pas supportées sur ce navigateur / appareil.
      </div>
    );
  }

  const granted = permission === "granted";

  return (
    <div
      className="rounded-2xl p-5 border flex flex-col gap-3"
      style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}
    >
      <h3
        className="text-base font-bold flex items-center gap-2"
        style={{ color: COLORS.teal }}
      >
        <Bell size={18} />
        Notifications
      </h3>
      <p className="text-xs" style={{ color: COLORS.muted }}>
        Recevez des alertes pour les messages, lives et récompenses. Nécessite un
        service worker et une clé VAPID configurée.
      </p>
      <p className="text-[11px] font-mono" style={{ color: COLORS.muted }}>
        État : {permission}
      </p>

      {granted ? (
        <button
          type="button"
          onClick={handleDisable}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold border transition disabled:opacity-50"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
            color: COLORS.ivory,
          }}
        >
          <BellOff size={14} />
          {loading ? "…" : "Désactiver les notifications"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEnable}
          disabled={loading || permission === "denied"}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
            color: COLORS.bg,
          }}
        >
          <Bell size={14} />
          {loading
            ? "…"
            : permission === "denied"
              ? "Bloqué par le navigateur"
              : "Activer les notifications"}
        </button>
      )}
    </div>
  );
}
