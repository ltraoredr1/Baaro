import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import {
  isPushSupported,
  getPermissionStateAsync,
  isPushOptedOut,
  enablePushNotifications,
  disablePushNotifications,
} from "../lib/pushNotifications.js";

/**
 * Bloc réglages notifications push (section « Push » de SettingsTab).
 * onChange(true|false) : appelé après activation / désactivation réussie,
 * pour mettre à jour le réglage `notif_push`.
 *
 * Corrections :
 * - Permission lue de façon asynchrone (Android/iOS renvoyaient toujours "default").
 * - « Activé » = permission accordée ET pas de désactivation volontaire
 *   (avant : après « Désactiver », le bouton restait sur « Désactiver »).
 */
export function PushSettings({ onChange }) {
  const { showToast } = useToast();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const perm = await getPermissionStateAsync();
    setPermission(perm);
    setEnabled(perm === "granted" && !isPushOptedOut());
  }, []);

  useEffect(() => {
    setSupported(isPushSupported());
    void refresh();
  }, [refresh]);

  const handleEnable = async () => {
    setLoading(true);
    const res = await enablePushNotifications();
    await refresh();
    setLoading(false);

    if (res.ok) {
      onChange?.(true);
      showToast("Notifications activées", "success");
    } else {
      showToast(res.error || "Impossible d'activer", "error");
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    const res = await disablePushNotifications();
    await refresh();
    setLoading(false);

    if (res.ok) {
      onChange?.(false);
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

  return (
    <div
      className="rounded-2xl p-5 border flex flex-col gap-3"
      style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}
    >
      <p className="text-xs" style={{ color: COLORS.muted }}>
        Recevez des alertes pour les messages, lives et récompenses.
      </p>
      <p className="text-[11px] font-mono" style={{ color: COLORS.muted }}>
        État : {enabled ? "activé" : permission === "granted" ? "désactivé" : permission}
      </p>

      {enabled ? (
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

export default PushSettings;
