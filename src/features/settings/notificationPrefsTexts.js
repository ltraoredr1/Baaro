// Textes du panneau de préférences de notifications.
// Catégorie « Gains & revenus » (plus de wallet crypto).
//
// Corrections : arabe ajouté ; la langue est lue avec ses variantes ("en-US" → "en").
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
  ar: {
    loading: "جارٍ تحميل التفضيلات…",
    saved: "تم الحفظ",
    savedLocal: "تم الحفظ على هذا الجهاز فقط (الخادم غير متاح)",
    error: "خطأ",
    labels: {
      push_enabled: "الإشعارات الفورية",
      messages: "الرسائل",
      social: "التواصل (متابعات، إعجابات)",
      live: "البث المباشر والنقاشات",
      earnings: "الأرباح والإيرادات",
      marketing: "التسويق",
    },
  },
};

export const KEYS = Object.keys(TEXTS.fr.labels);

export function currentTexts() {
  try {
    const code = (document.documentElement.lang || "fr")
      .split(/[-_]/)[0]
      .toLowerCase();
    return TEXTS[code] || TEXTS.fr;
  } catch {
    return TEXTS.fr;
  }
}
