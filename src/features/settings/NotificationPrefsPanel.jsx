import { useEffect, useRef, useState } from "react";
import { COLORS } from "../../theme.js";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../lib/notificationPreferences.js";
import { KEYS, currentTexts } from "./notificationPrefsTexts.js";

/**
 * Corrections :
 * - Plus de setState après démontage (fermeture du panneau pendant une sauvegarde).
 * - Échec du chargement : message visible au lieu d'afficher silencieusement
 *   les valeurs par défaut comme si c'étaient les vôtres.
 * - Enregistrements sérialisés : la dernière valeur choisie est toujours celle
 *   qui est envoyée, sans bloquer les cases pendant l'envoi.
 * - Cases accessibles (aria-busy) et zone de message annoncée (aria-live).
 */
export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgWarn, setMsgWarn] = useState(false);
  const tx = currentTexts();

  const mountedRef = useRef(true);
  const prefsRef = useRef(DEFAULT_NOTIFICATION_PREFERENCES);
  const queueRef = useRef(Promise.resolve());
  const pendingCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await getNotificationPreferences();

      if (cancelled) return;

      if (res.ok && res.data) {
        const loaded = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...res.data };
        prefsRef.current = loaded;
        setPrefs(loaded);
      } else if (!res.ok) {
        setMsgWarn(true);
        setMsg(res.error || tx.error);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key) => {
    const previous = prefsRef.current;
    const next = { ...previous, [key]: !previous[key] };

    prefsRef.current = next;
    setPrefs(next);
    setMsg("");
    setMsgWarn(false);

    pendingCountRef.current += 1;
    setSaving(true);

    queueRef.current = queueRef.current
      .then(() => saveNotificationPreferences(next))
      .then((res) => {
        if (!mountedRef.current) return;

        if (res.ok) {
          // Échec serveur : valeur gardée en local, on le dit clairement.
          const localOnly = !!res.local && !!res.error;
          setMsgWarn(localOnly);
          setMsg(localOnly ? tx.savedLocal : tx.saved);
        } else {
          // Annule uniquement cette case (les autres changements restent).
          const reverted = { ...prefsRef.current, [key]: previous[key] };
          prefsRef.current = reverted;
          setPrefs(reverted);
          setMsgWarn(true);
          setMsg(res.error || tx.error);
        }
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        const reverted = { ...prefsRef.current, [key]: previous[key] };
        prefsRef.current = reverted;
        setPrefs(reverted);
        setMsgWarn(true);
        setMsg(error?.message || tx.error);
      })
      .finally(() => {
        pendingCountRef.current -= 1;
        if (mountedRef.current && pendingCountRef.current === 0) {
          setSaving(false);
        }
      });
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        {tx.loading}
      </p>
    );
  }

  return (
    <div className="space-y-3" aria-busy={saving}>
      {KEYS.map((key) => (
        <label
          key={key}
          className="flex items-center justify-between gap-3 text-sm cursor-pointer"
        >
          <span style={{ color: COLORS.ivory }}>{tx.labels[key]}</span>
          <input
            type="checkbox"
            checked={!!prefs[key]}
            onChange={() => toggle(key)}
            className="h-4 w-4 accent-amber-500"
          />
        </label>
      ))}
      <p
        className="text-xs min-h-[1rem]"
        aria-live="polite"
        style={{ color: msgWarn ? COLORS.gold : COLORS.muted }}
      >
        {msg}
      </p>
    </div>
  );
}

export default NotificationPrefsPanel;
