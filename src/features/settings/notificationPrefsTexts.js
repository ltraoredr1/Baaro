// Plus de "Wallet" crypto — catégorie "Gains & revenus"
export const TEXTS = {
  fr: {
    loading: "Chargement des préférences…",
    saved: "Enregistré",
    savedLocal: "Enregistré sur cet appareil seulement (serveur indisponible)",
    error: "Erreur",
    labels: {
      push_enabled: "Notifications push",
      messages: "Messages",
      social: "Social (follows, likes)",
      live: "Lives & débats",
      earnings: "Gains & revenus",
      marketing: "Marketing",
    },
  },
  en: {
    loading: "Loading preferences…",
    saved: "Saved",
    savedLocal: "Saved on this device only (server unavailable)",
    error: "Error",
    labels: {
      push_enabled: "Push notifications",
      messages: "Messages",
      social: "Social (follows, likes)",
      live: "Lives & debates",
      earnings: "Earnings & payouts",
      marketing: "Marketing",
    },
  },
};

export const KEYS = Object.keys(TEXTS.fr.labels);

export function currentTexts() {
  try {
    const code = (document.documentElement.lang || "fr").split("-")[0];
    return TEXTS[code] || TEXTS.fr;
  } catch {
    return TEXTS.fr;
  }
}
