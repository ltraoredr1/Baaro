import { useEffect, useState } from "react";
import { COLORS } from "../../theme.js";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../lib/notificationPreferences.js";

// Le titre de la section est déjà affiché par l'écran Réglages :
// ce panneau n'affiche donc que les options.
const TEXTS = {
  fr: {
    loading: "Chargement des préférences…",
    saved: "Enregistré",
    error: "Erreur",
    labels: {
      push_enabled: "Notifications push",
      messages: "Messages",
      social: "Social (follows, likes)",
      live: "Lives & débats",
      marketing: "Marketing",
    },
  },
  en: {
    loading: "Loading preferences…",
    saved: "Saved",
    error: "Error",
    labels: {
      push_enabled: "Push notifications",
      messages: "Messages",
      social: "Social (follows, likes)",
      live: "Lives & debates",
      marketing: "Marketing",
    },
  },
};

const KEYS = Object.keys(TEXTS.fr.labels);

function currentTexts() {
  try {
    const code = (document.documentElement.lang || "fr").split("-")[0];
    return TEXTS[code] || TEXTS.fr;
  } catch {
    return TEXTS.fr;
  }
}

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
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
    const res = await saveNotificationPreferences(next);
    setSaving(false);
    if (res.ok) {
      setMsg(tx.saved);
    } else {
      setPrefs(previous);
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
        <p className="text-xs" style={{ color: COLORS.muted }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
