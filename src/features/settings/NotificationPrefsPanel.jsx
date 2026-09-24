
import { useEffect, useState } from "react";
import { COLORS } from "../../theme.js";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../lib/notificationPreferences.js";

const LABELS = {
  push_enabled: "Notifications push",
  messages: "Messages",
  social: "Social (follows, likes)",
  live: "Lives & débats",
  wallet: "Wallet & gains",
  marketing: "Marketing",
};

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getNotificationPreferences();
      if (!cancelled && res.ok && res.data) {
        setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...res.data });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setMsg("");
    const res = await saveNotificationPreferences(next);
    setSaving(false);
    setMsg(res.ok ? "Enregistré" : (res.error || "Erreur"));
  };

  if (loading) {
    return <p className="text-sm" style={{ color: COLORS.muted }}>Chargement préférences…</p>;
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: COLORS.border, background: COLORS.surface2 }}>
      <h3 className="text-sm font-bold" style={{ color: COLORS.gold }}>Préférences de notification</h3>
      {Object.keys(LABELS).map((key) => (
        <label key={key} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span style={{ color: COLORS.ivory }}>{LABELS[key]}</span>
          <input
            type="checkbox"
            checked={!!prefs[key]}
            disabled={saving}
            onChange={() => toggle(key)}
            className="h-4 w-4 accent-amber-500"
          />
        </label>
      ))}
      {msg && <p className="text-xs" style={{ color: COLORS.muted }}>{msg}</p>}
    </div>
  );
}
