import { useEffect, useState } from "react";
import { COLORS } from "../../theme.js";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../lib/notificationPreferences.js";
import { KEYS, currentTexts } from "./notificationPrefsTexts.js";

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgWarn, setMsgWarn] = useState(false);
  const tx = currentTexts();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getNotificationPreferences();
      if (!cancelled && res.ok && res.data) {
        setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...res.data });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (key) => {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setMsg("");
    setMsgWarn(false);
    const res = await saveNotificationPreferences(next);
    setSaving(false);
    if (res.ok) {
      // Échec serveur : la valeur est gardée en local, mais on le dit clairement
      const localOnly = !!res.local && !!res.error;
      setMsgWarn(localOnly);
      setMsg(localOnly ? tx.savedLocal : tx.saved);
    } else {
      setPrefs(previous);
      setMsgWarn(true);
      setMsg(res.error || tx.error);
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        {tx.loading}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {KEYS.map((key) => (
        <label
          key={key}
          className="flex items-center justify-between gap-3 text-sm cursor-pointer"
        >
          <span style={{ color: COLORS.ivory }}>{tx.labels[key]}</span>
          <input
            type="checkbox"
            checked={!!prefs[key]}
            disabled={saving}
            onChange={() => toggle(key)}
            className="h-4 w-4 accent-amber-500"
          />
        </label>
      ))}
      {msg ? (
        <p
          className="text-xs"
          style={{ color: msgWarn ? COLORS.gold : COLORS.muted }}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
