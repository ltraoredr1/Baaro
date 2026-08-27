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
  Wallet,
  MapPin,
  Gauge,
  Accessibility,
  Search,
  ChevronDown,
  ChevronUp,
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
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { supabase } from "../../supabaseClient.js";
import { PushSettings } from "../../components/PushSettings.jsx";

const STORAGE_KEY = "baaro_settings_v23";
const APP_VERSION = "2.0.0-v23";

const THEMES = [
  { id: "midnight", labelKey: "theme_midnight", bg: "#0B1220" },
  { id: "oled", labelKey: "theme_oled", bg: "#000000" },
  { id: "emerald", labelKey: "theme_emerald", bg: "#061A14" },
] as const;

/** UI complète : fr / en / ar / bm. Autres = préférence contenu. */
const LANGUAGES = [
  { code: "fr", label: "Français", fullUi: true },
  { code: "en", label: "English", fullUi: true },
  { code: "ar", label: "العربية", fullUi: true },
  { code: "bm", label: "Bamanankan", fullUi: true },
  { code: "wo", label: "Wolof", fullUi: false },
  { code: "ha", label: "Hausa", fullUi: false },
  { code: "ff", label: "Fulfulde", fullUi: false },
  { code: "sw", label: "Kiswahili", fullUi: false },
  { code: "pt", label: "Português", fullUi: false },
  { code: "es", label: "Español", fullUi: false },
] as const;

const COUNTRIES = [
  { code: "ML", flag: "🇲🇱", label: "Mali" },
  { code: "SN", flag: "🇸🇳", label: "Sénégal" },
  { code: "CI", flag: "🇨🇮", label: "Côte d'Ivoire" },
  { code: "BF", flag: "🇧🇫", label: "Burkina Faso" },
  { code: "GN", flag: "🇬🇳", label: "Guinée" },
  { code: "NE", flag: "🇳🇪", label: "Niger" },
  { code: "TG", flag: "🇹🇬", label: "Togo" },
  { code: "BJ", flag: "🇧🇯", label: "Bénin" },
  { code: "CM", flag: "🇨🇲", label: "Cameroun" },
  { code: "NG", flag: "🇳🇬", label: "Nigeria" },
  { code: "GH", flag: "🇬🇭", label: "Ghana" },
  { code: "MA", flag: "🇲🇦", label: "Maroc" },
  { code: "OTHER", flag: "🌍", label: "Autre" },
] as const;

const CURRENCIES = [
  { code: "XOF", label: "Franc CFA (XOF)" },
  { code: "NGN", label: "Naira (NGN)" },
  { code: "GHS", label: "Cedi (GHS)" },
  { code: "MAD", label: "Dirham (MAD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar (USD)" },
] as const;

const AI_REGIONS = [
  { id: "auto", labelKey: "ai_auto" },
  { id: "west_africa", labelKey: "ai_west_africa" },
  { id: "global", labelKey: "ai_global" },
] as const;

const RTL = new Set(["ar"]);

const STRINGS: Record<string, Record<string, string>> = {
  fr: {
    title: "Réglages",
    subtitle_connected: "Compte connecté",
    subtitle_local: "Préférences locales",
    search_placeholder: "Rechercher un réglage…",
    no_results: "Aucun réglage ne correspond.",
    appearance: "Apparence",
    theme: "Thème",
    theme_midnight: "Nuit",
    theme_oled: "OLED",
    theme_emerald: "Émeraude",
    language: "Langue de l'interface",
    region: "Région & paiements",
    region_desc: "Pays et devise pour Mobile Money (CinetPay) et contenus locaux.",
    country: "Pays",
    currency: "Devise préférée",
    data_network: "Données & réseau",
    data_network_desc: "Optimisé pour 2G/3G et forfaits limités.",
    data_saver: "Mode économie de données",
    data_saver_desc: "Moins de préchargement, images légères",
    autoplay_video: "Lecture auto des vidéos",
    autoplay_video_desc: "Désactiver pour économiser le forfait",
    offline_sync: "Sync hors-ligne prioritaire",
    offline_sync_desc: "File d'actions quand le réseau revient",
    ai_section: "Assistant IA régional",
    ai_section_desc: "Routage multi-fournisseurs selon la région.",
    ai_region: "Région IA",
    ai_auto: "Auto (selon pays)",
    ai_west_africa: "Afrique de l'Ouest",
    ai_global: "Global",
    ai_suggest: "Suggestions IA dans le fil",
    ai_suggest_desc: "Idées de posts et résumés",
    translate_section: "Traduction",
    translate_section_desc: "Fil et médias dans votre langue.",
    auto_translate: "Traduction automatique du fil",
    auto_translate_desc: "Afficher le contenu dans ma langue",
    translate_media: "Traduction média / sous-titres",
    translate_media_desc: "Vidéos et stories si disponible",
    wallet_section: "Wallet BARO & gains",
    wallet_section_desc: "Solde public et visibilité créateur.",
    hide_wallet: "Masquer le solde public",
    hide_wallet_desc: "Cache BARO / points sur le profil",
    show_earnings: "Afficher les gains créateur",
    show_earnings_desc: "Badge et stats visibles",
    content_section: "Contenu & communauté",
    content_section_desc: "Priorité débats et contenu local.",
    prefer_debates: "Mettre en avant les débats",
    prefer_debates_desc: "Salles et votes en premier",
    prefer_local: "Contenu de ma région d'abord",
    prefer_local_desc: "Découverte par pays",
    privacy: "Confidentialité & sécurité",
    private_profile: "Profil privé",
    private_profile_desc: "Masquer des recherches publiques",
    block_screenshots: "Bloquer les captures",
    block_screenshots_desc: "Capacitor Android",
    biometric: "Biométrie",
    biometric_desc: "Face ID / empreinte pour le wallet",
    a11y: "Accessibilité",
    large_text: "Texte agrandi",
    large_text_desc: "Lecture plus confortable",
    reduce_motion: "Réduire les animations",
    reduce_motion_desc: "Moins de transitions",
    profile_section: "Profil",
    edit_profile: "Modifier le profil",
    save_profile: "Enregistrer",
    cancel: "Annuler",
    display_name: "Nom affiché",
    flag_emoji: "Drapeau (emoji)",
    bio: "Bio",
    profile_saved: "✅ Profil mis à jour",
    profile_error: "❌ Impossible d'enregistrer le profil",
    secure_account: "Sécuriser mon compte",
    secure_account_desc:
      "Compte invité : ajoutez un e-mail ou un réseau social pour conserver points et historique.",
    email: "E-mail",
    password: "Mot de passe",
    secure_with_email: "Sécuriser avec cet e-mail",
    link_google: "Lier Google",
    link_facebook: "Lier Facebook",
    login_existing: "Se connecter à ce compte existant",
    forgot_password: "Mot de passe oublié ?",
    reset_sent: "✅ E-mail de réinitialisation envoyé.",
    secure_check_mail:
      "✅ Vérifiez votre boîte mail pour confirmer l'adresse.",
    privacy_policy: "Politique de confidentialité",
    privacy_body:
      "BAARO traite les données nécessaires au compte, au fil, au wallet et aux notifications. Les montants wallet sont validés côté serveur. Vous pouvez demander la suppression de votre compte. Les préférences de cet écran restent sur l'appareil et, si connecté, dans user_settings.",
    privacy_back: "Retour aux réglages",
    reset_prefs: "Réinitialiser les préférences",
    reset_confirm: "Remettre tous les réglages aux valeurs par défaut ?",
    reset_done: "✅ Préférences réinitialisées",
    export_prefs: "Exporter les préférences",
    import_prefs: "Importer les préférences",
    export_done: "✅ Fichier téléchargé",
    import_done: "✅ Préférences importées",
    import_error: "❌ Fichier invalide",
    copy_prefs: "Copier le JSON",
    copy_done: "✅ Copié dans le presse-papiers",
    mfa_section: "Double authentification (2FA)",
    mfa_desc:
      "Statut TOTP / SMS côté Supabase Auth. L’activation complète se fait dans le flux de sécurité du compte.",
    mfa_enabled: "2FA activée",
    mfa_disabled: "2FA non activée",
    mfa_factors: "facteur(s) vérifié(s)",
    mfa_loading: "Vérification…",
    mfa_guest: "Connectez un compte stable pour gérer la 2FA.",
    lang_partial_hint:
      "Les langues locales orientent le contenu ; l’interface reste FR/EN/AR/BM pour l’instant.",
    sessions_section: "Sessions actives",
    sessions_desc: "Appareil actuel et déconnexion globale (tous les appareils).",
    session_current: "Session actuelle",
    session_device: "Appareil",
    session_expires: "Expire",
    session_unknown: "Inconnu",
    logout_all: "Déconnecter tous les appareils",
    logout_all_confirm:
      "Déconnecter ce compte sur tous les appareils ? Vous devrez vous reconnecter partout.",
    logout_all_done: "✅ Toutes les sessions ont été fermées",
    delete_account: "Supprimer mon compte",
    delete_account_desc:
      "Action irréversible. Vos données profil / préférences locales seront effacées ; la suppression serveur dépend de la configuration Supabase.",
    delete_confirm_1:
      "Supprimer définitivement votre compte BAARO ? Cette action est irréversible.",
    delete_confirm_2:
      "Dernière confirmation : tapez SUPPRIMER pour confirmer (ou OK dans la boîte de dialogue).",
    delete_done: "✅ Compte déconnecté et données locales effacées",
    delete_error: "❌ Impossible de supprimer le compte côté serveur",
    replay_onboarding: "Revoir l'introduction BAARO",
    logout: "Se déconnecter",
    logout_confirm: "Voulez-vous vraiment vous déconnecter ?",
    guest: "Invité",
    vs_competitors: "Conçu pour l'Afrique & les marchés émergents",
    version: "Version",
  },
  en: {
    title: "Settings",
    subtitle_connected: "Signed in",
    subtitle_local: "Local preferences",
    search_placeholder: "Search a setting…",
    no_results: "No matching settings.",
    appearance: "Appearance",
    theme: "Theme",
    theme_midnight: "Midnight",
    theme_oled: "OLED",
    theme_emerald: "Emerald",
    language: "Interface language",
    region: "Region & payments",
    region_desc: "Country and currency for Mobile Money and local content.",
    country: "Country",
    currency: "Preferred currency",
    data_network: "Data & network",
    data_network_desc: "Built for 2G/3G and limited plans.",
    data_saver: "Data saver mode",
    data_saver_desc: "Less preload, lighter images",
    autoplay_video: "Autoplay videos",
    autoplay_video_desc: "Turn off to save data",
    offline_sync: "Priority offline sync",
    offline_sync_desc: "Action queue when network returns",
    ai_section: "Regional AI assistant",
    ai_section_desc: "Multi-provider routing by region.",
    ai_region: "AI region",
    ai_auto: "Auto (by country)",
    ai_west_africa: "West Africa",
    ai_global: "Global",
    ai_suggest: "AI suggestions in feed",
    ai_suggest_desc: "Post ideas and summaries",
    translate_section: "Translation",
    translate_section_desc: "Feed and media in your language.",
    auto_translate: "Auto-translate feed",
    auto_translate_desc: "Show content in my language",
    translate_media: "Media translation / captions",
    translate_media_desc: "Videos and stories when available",
    wallet_section: "BARO wallet & earnings",
    wallet_section_desc: "Public balance and creator visibility.",
    hide_wallet: "Hide public balance",
    hide_wallet_desc: "Hide BARO / points on profile",
    show_earnings: "Show creator earnings",
    show_earnings_desc: "Visible badge and stats",
    content_section: "Content & community",
    content_section_desc: "Prioritize debates and local content.",
    prefer_debates: "Highlight debates",
    prefer_debates_desc: "Rooms and votes first",
    prefer_local: "Regional content first",
    prefer_local_desc: "Discovery by country",
    privacy: "Privacy & security",
    private_profile: "Private profile",
    private_profile_desc: "Hide from public search",
    block_screenshots: "Block screenshots",
    block_screenshots_desc: "Capacitor Android",
    biometric: "Biometrics",
    biometric_desc: "Face ID / fingerprint for wallet",
    a11y: "Accessibility",
    large_text: "Larger text",
    large_text_desc: "Easier reading",
    reduce_motion: "Reduce motion",
    reduce_motion_desc: "Fewer animations",
    profile_section: "Profile",
    edit_profile: "Edit profile",
    save_profile: "Save",
    cancel: "Cancel",
    display_name: "Display name",
    flag_emoji: "Flag (emoji)",
    bio: "Bio",
    profile_saved: "✅ Profile updated",
    profile_error: "❌ Could not save profile",
    secure_account: "Secure my account",
    secure_account_desc:
      "Guest account: add email or social login to keep points and history.",
    email: "Email",
    password: "Password",
    secure_with_email: "Secure with this email",
    link_google: "Link Google",
    link_facebook: "Link Facebook",
    login_existing: "Sign in to this existing account",
    forgot_password: "Forgot password?",
    reset_sent: "✅ Reset email sent.",
    secure_check_mail: "✅ Check your inbox to confirm the address.",
    privacy_policy: "Privacy policy",
    privacy_body:
      "BAARO processes data needed for account, feed, wallet and notifications. Wallet amounts are validated server-side. You may request account deletion. Preferences on this screen stay on device and, if signed in, in user_settings.",
    privacy_back: "Back to settings",
    reset_prefs: "Reset preferences",
    reset_confirm: "Reset all settings to defaults?",
    reset_done: "✅ Preferences reset",
    export_prefs: "Export preferences",
    import_prefs: "Import preferences",
    export_done: "✅ File downloaded",
    import_done: "✅ Preferences imported",
    import_error: "❌ Invalid file",
    copy_prefs: "Copy JSON",
    copy_done: "✅ Copied to clipboard",
    mfa_section: "Two-factor authentication (2FA)",
    mfa_desc:
      "TOTP / SMS status from Supabase Auth. Full enrollment is done in the account security flow.",
    mfa_enabled: "2FA enabled",
    mfa_disabled: "2FA not enabled",
    mfa_factors: "verified factor(s)",
    mfa_loading: "Checking…",
    mfa_guest: "Sign in with a stable account to manage 2FA.",
    lang_partial_hint:
      "Local languages guide content preference; UI stays FR/EN/AR/BM for now.",
    sessions_section: "Active sessions",
    sessions_desc: "Current device and global sign-out (all devices).",
    session_current: "Current session",
    session_device: "Device",
    session_expires: "Expires",
    session_unknown: "Unknown",
    logout_all: "Sign out all devices",
    logout_all_confirm:
      "Sign out this account on every device? You will need to sign in again everywhere.",
    logout_all_done: "✅ All sessions closed",
    delete_account: "Delete my account",
    delete_account_desc:
      "Irreversible. Local profile/preferences are cleared; server deletion depends on Supabase setup.",
    delete_confirm_1:
      "Permanently delete your BAARO account? This cannot be undone.",
    delete_confirm_2:
      "Final confirmation: type DELETE to confirm (or OK in the dialog).",
    delete_done: "✅ Signed out and local data cleared",
    delete_error: "❌ Could not delete account on the server",
    replay_onboarding: "Replay BAARO intro",
    logout: "Sign out",
    logout_confirm: "Do you really want to sign out?",
    guest: "Guest",
    vs_competitors: "Built for Africa & emerging markets",
    version: "Version",
  },
  ar: {
    title: "الإعدادات",
    subtitle_connected: "مسجّل الدخول",
    subtitle_local: "تفضيلات محلية",
    search_placeholder: "ابحث عن إعداد…",
    no_results: "لا توجد إعدادات مطابقة.",
    appearance: "المظهر",
    theme: "السمة",
    theme_midnight: "ليلي",
    theme_oled: "OLED",
    theme_emerald: "زمردي",
    language: "لغة الواجهة",
    region: "المنطقة والمدفوعات",
    region_desc: "البلد والعملة للدفع والمحتوى المحلي.",
    country: "البلد",
    currency: "العملة المفضلة",
    data_network: "البيانات والشبكة",
    data_network_desc: "مُحسَّن لشبكات 2G/3G.",
    data_saver: "وضع توفير البيانات",
    data_saver_desc: "تحميل أقل وصور أخف",
    autoplay_video: "تشغيل تلقائي للفيديو",
    autoplay_video_desc: "عطّله لتوفير الباقة",
    offline_sync: "مزامنة دون اتصال أولاً",
    offline_sync_desc: "قائمة إجراءات عند عودة الشبكة",
    ai_section: "مساعد ذكاء اصطناعي إقليمي",
    ai_section_desc: "توجيه متعدد المزودين حسب المنطقة.",
    ai_region: "منطقة الذكاء الاصطناعي",
    ai_auto: "تلقائي (حسب البلد)",
    ai_west_africa: "غرب أفريقيا",
    ai_global: "عالمي",
    ai_suggest: "اقتراحات الذكاء في الخلاصة",
    ai_suggest_desc: "أفكار منشورات وملخصات",
    translate_section: "الترجمة",
    translate_section_desc: "الخلاصة والوسائط بلغتك.",
    auto_translate: "ترجمة تلقائية للخلاصة",
    auto_translate_desc: "عرض المحتوى بلغتي",
    translate_media: "ترجمة الوسائط",
    translate_media_desc: "فيديوهات وقصص عند التوفر",
    wallet_section: "محفظة BARO والأرباح",
    wallet_section_desc: "الرصيد العام وظهور المنشئ.",
    hide_wallet: "إخفاء الرصيد العام",
    hide_wallet_desc: "إخفاء BARO / النقاط",
    show_earnings: "عرض أرباح المنشئ",
    show_earnings_desc: "شارة وإحصائيات مرئية",
    content_section: "المحتوى والمجتمع",
    content_section_desc: "أولوية النقاشات والمحتوى المحلي.",
    prefer_debates: "إبراز النقاشات",
    prefer_debates_desc: "الغرف والتصويت أولاً",
    prefer_local: "محتوى منطقتي أولاً",
    prefer_local_desc: "اكتشاف حسب البلد",
    privacy: "الخصوصية والأمان",
    private_profile: "ملف خاص",
    private_profile_desc: "إخفاء من البحث العام",
    block_screenshots: "منع لقطات الشاشة",
    block_screenshots_desc: "Capacitor Android",
    biometric: "البيومترية",
    biometric_desc: "Face ID / بصمة للمحفظة",
    a11y: "إمكانية الوصول",
    large_text: "نص أكبر",
    large_text_desc: "قراءة أسهل",
    reduce_motion: "تقليل الحركة",
    reduce_motion_desc: "انتقالات أقل",
    profile_section: "الملف الشخصي",
    edit_profile: "تعديل الملف",
    save_profile: "حفظ",
    cancel: "إلغاء",
    display_name: "الاسم المعروض",
    flag_emoji: "العلم (رمز تعبيري)",
    bio: "نبذة",
    profile_saved: "✅ تم تحديث الملف",
    profile_error: "❌ تعذر حفظ الملف",
    secure_account: "تأمين حسابي",
    secure_account_desc: "حساب زائر: أضف بريداً أو شبكة اجتماعية.",
    email: "البريد",
    password: "كلمة المرور",
    secure_with_email: "تأمين بهذا البريد",
    link_google: "ربط Google",
    link_facebook: "ربط Facebook",
    login_existing: "تسجيل الدخول لهذا الحساب",
    forgot_password: "نسيت كلمة المرور؟",
    reset_sent: "✅ تم إرسال بريد إعادة التعيين.",
    secure_check_mail: "✅ تحقق من بريدك لتأكيد العنوان.",
    privacy_policy: "سياسة الخصوصية",
    privacy_body:
      "يعالج BAARO البيانات اللازمة للحساب والخلاصة والمحفظة والإشعارات. تُتحقق مبالغ المحفظة من الخادم. يمكنك طلب حذف الحساب.",
    privacy_back: "العودة إلى الإعدادات",
    reset_prefs: "إعادة ضبط التفضيلات",
    reset_confirm: "إعادة كل الإعدادات إلى الافتراضي؟",
    reset_done: "✅ تمت إعادة الضبط",
    export_prefs: "تصدير التفضيلات",
    import_prefs: "استيراد التفضيلات",
    export_done: "✅ تم تنزيل الملف",
    import_done: "✅ تم استيراد التفضيلات",
    import_error: "❌ ملف غير صالح",
    copy_prefs: "نسخ JSON",
    copy_done: "✅ نُسخ إلى الحافظة",
    mfa_section: "المصادقة الثنائية (2FA)",
    mfa_desc: "حالة TOTP / SMS من Supabase Auth.",
    mfa_enabled: "2FA مفعّلة",
    mfa_disabled: "2FA غير مفعّلة",
    mfa_factors: "عامل(عوامل) موثّق",
    mfa_loading: "جارٍ التحقق…",
    mfa_guest: "سجّل بحساب مستقر لإدارة 2FA.",
    lang_partial_hint:
      "اللغات المحلية توجّه المحتوى؛ الواجهة تبقى FR/EN/AR/BM حاليًا.",
    sessions_section: "الجلسات النشطة",
    sessions_desc: "الجهاز الحالي وتسجيل الخروج من كل الأجهزة.",
    session_current: "الجلسة الحالية",
    session_device: "الجهاز",
    session_expires: "تنتهي",
    session_unknown: "غير معروف",
    logout_all: "تسجيل الخروج من كل الأجهزة",
    logout_all_confirm: "تسجيل الخروج من كل الأجهزة؟",
    logout_all_done: "✅ أُغلقت كل الجلسات",
    delete_account: "حذف حسابي",
    delete_account_desc: "إجراء لا رجعة فيه. تُمسح البيانات المحلية.",
    delete_confirm_1: "حذف حساب BAARO نهائيًا؟",
    delete_confirm_2: "تأكيد أخير.",
    delete_done: "✅ تم تسجيل الخروج ومسح البيانات المحلية",
    delete_error: "❌ تعذر حذف الحساب على الخادم",
    replay_onboarding: "إعادة مقدمة BAARO",
    logout: "تسجيل الخروج",
    logout_confirm: "هل تريد حقًا تسجيل الخروج؟",
    guest: "زائر",
    vs_competitors: "مُصمَّم لأفريقيا والأسواق الناشئة",
    version: "الإصدار",
  },
  bm: {
    title: "Sɛbɛnniw",
    subtitle_connected: "Jɛkulu don",
    subtitle_local: "Yɛrɛ yɔrɔ sago",
    search_placeholder: "Sɛbɛnni ɲini…",
    no_results: "Foyi ma sɔrɔ.",
    appearance: "Yɛlɛma",
    theme: "Kɔlɔrɔ",
    theme_midnight: "Su",
    theme_oled: "OLED",
    theme_emerald: "Kɛnɛ",
    language: "Kan",
    region: "Jamana & sara",
    region_desc: "Jamana ani wari Mobile Money ye.",
    country: "Jamana",
    currency: "Wari",
    data_network: "Data & rezo",
    data_network_desc: "2G/3G ye.",
    data_saver: "Data tigɛ",
    data_saver_desc: "Video dɔgɔya",
    autoplay_video: "Video automatiki",
    autoplay_video_desc: "A kɛ ka data mara",
    offline_sync: "Offline fɔlɔ",
    offline_sync_desc: "Kalan ni rezo banna",
    ai_section: "IA regional",
    ai_section_desc: "IA bɛ segin jamana kan.",
    ai_region: "IA yɔrɔ",
    ai_auto: "Automatiki",
    ai_west_africa: "Afrika tilebin",
    ai_global: "Duniya bɛɛ",
    ai_suggest: "IA hakilina",
    ai_suggest_desc: "Sɛbɛnni hakilina",
    translate_section: "Bamanankan kelen",
    translate_section_desc: "Kuma ni video bamanankan na.",
    auto_translate: "Fili automatiki",
    auto_translate_desc: "A yira n ka kan na",
    translate_media: "Video bamanankan",
    translate_media_desc: "Ni a bɛ yen",
    wallet_section: "Wallet BARO",
    wallet_section_desc: "Wari ni points.",
    hide_wallet: "Wari dogo",
    hide_wallet_desc: "Profil kan",
    show_earnings: "Sɔrɔ yira",
    show_earnings_desc: "Créateur sɔrɔ",
    content_section: "Kuma & jɛkulu",
    content_section_desc: "Débat ni jamana kuma.",
    prefer_debates: "Débat fɔlɔ",
    prefer_debates_desc: "Discussion fɔlɔ",
    prefer_local: "Jamana kuma fɔlɔ",
    prefer_local_desc: "I ka jamana",
    privacy: "Gundo & lakana",
    private_profile: "Profil gundo",
    private_profile_desc: "Ɲini kɔnɔ dogo",
    block_screenshots: "Screenshot bali",
    block_screenshots_desc: "Android",
    biometric: "Biométrie",
    biometric_desc: "Bolokɔnighɛsɛ wallet ye",
    a11y: "Dɔnni nɔgɔya",
    large_text: "Sɛbɛn belebele",
    large_text_desc: "Kalanni nɔgɔya",
    reduce_motion: "Yɛlɛma dɔgɔya",
    reduce_motion_desc: "Animation dɔgɔya",
    profile_section: "Profil",
    edit_profile: "Profil yɛlɛma",
    save_profile: "Mara",
    cancel: "Kassara",
    display_name: "Tɔgɔ",
    flag_emoji: "Jamana taamasiyɛn",
    bio: "I ye mɔgɔ jumɛn ye",
    profile_saved: "✅ Profil mara la",
    profile_error: "❌ Profil ma se ka mara",
    secure_account: "Jɛkulu lakana",
    secure_account_desc: "Email walima Facebook/Google kɛ.",
    email: "Email",
    password: "Secret code",
    secure_with_email: "Email fɛ lakana",
    link_google: "Google kɛ",
    link_facebook: "Facebook kɛ",
    login_existing: "Jɛkulu in na don",
    forgot_password: "Secret code ɲini?",
    reset_sent: "✅ Email ci la",
    secure_check_mail: "✅ I ka email lajɛ",
    privacy_policy: "Gundo sariya",
    privacy_body:
      "BAARO bɛ data kɛ jɛkulu, fili, wallet ani notifications ye. Wallet wari bɛ sɛgɛsɛgɛ serveur fɛ.",
    privacy_back: "Sɛbɛnniw la segin",
    reset_prefs: "Sago kɔrɔn",
    reset_confirm: "Sago bɛɛ kɔrɔn?",
    reset_done: "✅ Sago kɔrɔnna",
    export_prefs: "Sago bɔ",
    import_prefs: "Sago don",
    export_done: "✅ Fichier telechargé",
    import_done: "✅ Sago don na",
    import_error: "❌ Fichier tɛ ɲɛ",
    copy_prefs: "JSON kopi",
    copy_done: "✅ Kopi kɛra",
    mfa_section: "2FA",
    mfa_desc: "TOTP / SMS Supabase fɛ.",
    mfa_enabled: "2FA sigilen",
    mfa_disabled: "2FA tɛ",
    mfa_factors: "faktor",
    mfa_loading: "Lajɛli…",
    mfa_guest: "Jɛkulu dɔgɔman kɛ 2FA ye.",
    lang_partial_hint: "Kanw bɛ kuma ɲɛsin; UI bɛ FR/EN/AR/BM.",
    sessions_section: "Sessions",
    sessions_desc: "Telefono in ani bɛɛ ka bɔ.",
    session_current: "Session sisan",
    session_device: "Minan",
    session_expires: "A banna",
    session_unknown: "A tɛ dɔn",
    logout_all: "Minan bɛɛ ka bɔ",
    logout_all_confirm: "Minan bɛɛ ka bɔ?",
    logout_all_done: "✅ Sessions bɛɛ datugulen",
    delete_account: "N ka jɛkulu tigɛ",
    delete_account_desc: "A tɛ se ka segin.",
    delete_confirm_1: "Jɛkulu tigɛ fɔlɔfɔlɔ?",
    delete_confirm_2: "A ɲɛnajɛ laban.",
    delete_done: "✅ Bɔra ani data tigɛra",
    delete_error: "❌ Serveur ma se ka tigɛ",
    replay_onboarding: "BAARO fɔlɔ segin",
    logout: "Bɔ",
    logout_confirm: "I b'a fɛ ka bɔ?",
    guest: "Dunan",
    vs_competitors: "A dilannen Afrika ye",
    version: "Version",
  },
};

type SettingsState = {
  theme: string;
  lang: string;
  country: string;
  currency: string;
  data_saver: boolean;
  autoplay_video: boolean;
  offline_sync: boolean;
  ai_region: string;
  ai_suggest: boolean;
  auto_translate: boolean;
  translate_media: boolean;
  hide_wallet: boolean;
  show_earnings: boolean;
  prefer_debates: boolean;
  prefer_local: boolean;
  private_profile: boolean;
  block_screenshots: boolean;
  biometric: boolean;
  large_text: boolean;
  reduce_motion: boolean;
  notif_push: boolean;
};

const DEFAULT_SETTINGS: SettingsState = {
  theme: "midnight",
  lang: "fr",
  country: "ML",
  currency: "XOF",
  data_saver: true,
  autoplay_video: false,
  offline_sync: true,
  ai_region: "auto",
  ai_suggest: true,
  auto_translate: true,
  translate_media: true,
  hide_wallet: false,
  show_earnings: false,
  prefer_debates: true,
  prefer_local: true,
  private_profile: false,
  block_screenshots: true,
  biometric: false,
  large_text: false,
  reduce_motion: false,
  notif_push: true,
};

function loadLocal(): SettingsState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("baaro_settings_v21") ||
      localStorage.getItem("baaro_settings_v20");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function uiLang(code: string): string {
  if (code in STRINGS) return code;
  return "fr";
}

function applyDocumentLang(lang: string) {
  try {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
  } catch {
    /* ignore */
  }
}

function applyA11y(settings: SettingsState) {
  try {
    const root = document.documentElement;
    root.classList.toggle("baaro-large-text", !!settings.large_text);
    root.classList.toggle("baaro-reduce-motion", !!settings.reduce_motion);
    root.dataset.baaroDataSaver = settings.data_saver ? "1" : "0";
    root.dataset.baaroCountry = settings.country || "";
    root.dataset.baaroCurrency = settings.currency || "";
  } catch {
    /* ignore */
  }
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full transition-colors"
      style={{
        backgroundColor: enabled ? COLORS.teal : "rgba(255,255,255,0.12)",
      }}
    >
      <span
        className="inline-block h-[22px] w-[22px] rounded-full bg-white shadow-md transition-transform"
        style={{ transform: enabled ? "translateX(26px)" : "translateX(4px)" }}
      />
    </button>
  );
}

function ToggleRow({
  title,
  desc,
  enabled,
  onChange,
}: {
  title: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px]" style={{ color: COLORS.muted }}>
          {desc}
        </p>
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}

function CollapsibleSection({
  id,
  icon: Icon,
  title,
  desc,
  accent = COLORS.gold,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: typeof User;
  title: string;
  desc?: string;
  accent?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
      data-section={id}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h3
            className="text-base font-bold flex items-center gap-2"
            style={{ color: accent }}
          >
            <Icon size={18} className="shrink-0" />
            {title}
          </h3>
          {desc && open ? (
            <p
              className="text-[11px] mt-1 leading-relaxed"
              style={{ color: COLORS.muted }}
            >
              {desc}
            </p>
          ) : null}
        </div>
        {open ? (
          <ChevronUp size={18} style={{ color: COLORS.muted }} />
        ) : (
          <ChevronDown size={18} style={{ color: COLORS.muted }} />
        )}
      </button>
      {open && <div className="px-5 pb-4 flex flex-col gap-3">{children}</div>}
    </section>
  );
}

const inputStyle = {
  background: COLORS.surface2,
  borderColor: COLORS.border,
  color: COLORS.ivory,
} as const;

type Props = {
  userId?: string | null;
  userProfile?: {
    display_name?: string;
    handle?: string;
    avatar_url?: string;
    flag?: string;
    bio?: string;
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
  const [sessionInfo, setSessionInfo] = useState<{
    expiresAt?: string | null;
    email?: string | null;
    userAgent?: string;
  } | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true,
    secure: true,
    appearance: true,
    language: false,
    region: true,
    data: true,
    ai: false,
    translate: false,
    wallet: false,
    content: false,
    privacy: false,
    a11y: false,
    mfa: false,
    sessions: false,
    danger: false,
  });

  const lang = uiLang(settings.lang);
  const t = useCallback(
    (key: string) => STRINGS[lang]?.[key] ?? STRINGS.fr[key] ?? key,
    [lang]
  );

  const toggleSection = (id: string) =>
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
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
          is_anonymous: data.user.is_anonymous === true,
        });
        const res = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (!cancelled && res?.data) {
          setSettings((s) => ({ ...s, ...res.data }));
        }
        // Session courante
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

        // 2FA status (affichage uniquement)
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
    if (patch.theme && onSelectTheme) onSelectTheme(patch.theme);
    if (!user?.id) return;
    try {
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        ...next,
        updated_at: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || profileLoading) return;
    setProfileLoading(true);
    setMessage("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: editName.trim() || displayName,
          flag: editFlag.trim() || "🌍",
          bio: editBio,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      const updated = {
        ...userProfile,
        display_name: editName.trim() || displayName,
        flag: editFlag.trim() || "🌍",
        bio: editBio,
      };
      setUserProfile?.(updated);
      setIsEditing(false);
      setMessage(t("profile_saved"));
    } catch (err) {
      console.error(err);
      setMessage(t("profile_error"));
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
      // Tentative RPC métier si présente (Supabase)
      const { error: rpcError } = await supabase.rpc("delete_own_account");
      if (rpcError) {
        // Fallback API Vercel éventuelle
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
  const handle =
    userProfile?.handle ||
    (user?.email ? `@${user.email.split("@")[0]}` : "@invite");
  const avatarUrl =
    userProfile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=1A2740`;
  const activeTheme = currentTheme || settings.theme;
  const countryMeta =
    COUNTRIES.find((c) => c.code === settings.country) ||
    COUNTRIES[COUNTRIES.length - 1];
  const isAnonymous = user?.is_anonymous === true;

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
      profile: match("profile_section", "display_name", "bio"),
      secure: isAnonymous && match("secure_account", "email", "password"),
      appearance: match("appearance", "theme"),
      language: match("language"),
      region: match("region", "country", "currency"),
      data: match(
        "data_network",
        "data_saver",
        "autoplay_video",
        "offline_sync"
      ),
      ai: match("ai_section", "ai_region", "ai_suggest"),
      translate: match("translate_section", "auto_translate", "translate_media"),
      wallet: match("wallet_section", "hide_wallet", "show_earnings"),
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
      push: match("title") || !q,
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
        <p className="text-sm leading-relaxed" style={{ color: COLORS.mutedLight }}>
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
          className="grid h-11 w-11 place-items-center rounded-2xl font-black text-sm"
          style={{
            background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.teal} 100%)`,
            color: COLORS.bg,
          }}
        >
          B
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold leading-none">{t("title")}</h2>
          <p className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
            {user ? t("subtitle_connected") : t("subtitle_local")}
          </p>
        </div>
      </div>

      <div
        className="rounded-xl px-4 py-2.5 text-[11px] font-medium border"
        style={{
          background: "rgba(45,191,166,0.08)",
          borderColor: COLORS.borderTeal,
          color: COLORS.teal,
        }}
      >
        {t("vs_competitors")}
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
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl}
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
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("display_name")}
                className="w-full rounded-xl p-3 text-sm outline-none border"
                style={inputStyle}
              />
              <input
                value={editFlag}
                onChange={(e) => setEditFlag(e.target.value)}
                placeholder={t("flag_emoji")}
                maxLength={4}
                className="w-full rounded-xl p-3 text-sm outline-none border"
                style={inputStyle}
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder={t("bio")}
                rows={2}
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
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => save({ theme: th.id })}
                  className="p-3 rounded-xl border text-center text-xs font-bold"
                  style={{
                    background: th.bg,
                    borderColor: selected ? COLORS.gold : COLORS.border,
                    color: COLORS.ivory,
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
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => save({ lang: l.code })}
                  className="py-2.5 rounded-xl border text-xs font-bold"
                  style={{
                    background: selected ? COLORS.goldGlow : COLORS.surface2,
                    borderColor: selected ? COLORS.borderGold : COLORS.border,
                    color: selected ? COLORS.gold : COLORS.ivory,
                  }}
                >
                  {l.label}
                  {!l.fullUi && (
                    <span
                      className="block text-[9px] font-normal mt-0.5 opacity-70"
                      style={{ color: COLORS.muted }}
                    >
                      contenu
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: COLORS.muted }}>
            {t("lang_partial_hint")}
          </p>
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
              className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded-xl p-2 border"
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

      {/* Wallet */}
      {visible.wallet && (
        <CollapsibleSection
          id="wallet"
          icon={Wallet}
          title={t("wallet_section")}
          desc={t("wallet_section_desc")}
          accent={COLORS.gold}
          open={openSections.wallet || !!q}
          onToggle={() => toggleSection("wallet")}
        >
          <ToggleRow
            title={t("hide_wallet")}
            desc={t("hide_wallet_desc")}
            enabled={settings.hide_wallet}
            onChange={(v) => save({ hide_wallet: v })}
          />
          <ToggleRow
            title={t("show_earnings")}
            desc={t("show_earnings_desc")}
            enabled={settings.show_earnings}
            onChange={(v) => save({ show_earnings: v })}
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

      {visible.push && <PushSettings />}

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
          <button
            type="button"
            disabled={accountBusy}
            onClick={handleDeleteAccount}
            className="w-full py-3 rounded-xl text-sm font-bold border disabled:opacity-50"
            style={{
              borderColor: "rgba(239,68,68,0.5)",
              color: "#F87171",
              background: "rgba(239,68,68,0.12)",
            }}
          >
            <span className="inline-flex items-center gap-2 justify-center">
              <Trash2 size={16} />
              {t("delete_account")}
            </span>
          </button>
        </CollapsibleSection>
      )}

      {onReplayOnboarding && (
        <button
          type="button"
          onClick={onReplayOnboarding}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderGold,
            color: COLORS.gold,
          }}
        >
          <Sparkles size={16} />
          {t("replay_onboarding")}
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowPrivacy(true)}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.borderTeal,
          color: COLORS.teal,
        }}
      >
        <FileText size={16} />
        {t("privacy_policy")}
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleExportPrefs}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderTeal,
            color: COLORS.teal,
          }}
        >
          <Download size={16} />
          {t("export_prefs")}
        </button>
        <button
          type="button"
          onClick={() => fileInputEl?.click()}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderGold,
            color: COLORS.gold,
          }}
        >
          <Upload size={16} />
          {t("import_prefs")}
        </button>
        <button
          type="button"
          onClick={handleCopyPrefs}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
            color: COLORS.ivory,
          }}
        >
          <Copy size={16} />
          {t("copy_prefs")}
        </button>
      </div>
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

      <button
        type="button"
        onClick={handleResetPrefs}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.muted,
        }}
      >
        <RotateCcw size={16} />
        {t("reset_prefs")}
      </button>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold border"
        style={{
          borderColor: "rgba(239,68,68,0.4)",
          color: "#F87171",
          background: "rgba(239,68,68,0.1)",
        }}
      >
        <LogOut size={16} />
        {t("logout")}
      </button>

      <p className="text-center text-[10px] py-1" style={{ color: COLORS.muted }}>
        {t("version")} {APP_VERSION}
      </p>
    </div>
  );
}
