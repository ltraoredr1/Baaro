import {
  MessageSquare,
  Swords,
  Zap,
  Coins,
  Image as ImageIcon,
} from "lucide-react";

/* ---------- Suggestions (prompts prédéfinis) ---------- */

export const PRESETS_NORMAL = [
  { icon: MessageSquare, text: "Résume ce post en points clés" },
  { icon: Swords, text: "Prépare-moi un débat : arguments pour et contre" },
  { icon: Zap, text: "Aide-moi à répondre à un message difficile" },
  { icon: ImageIcon, text: "Génère une image verticale pour ma story" },
  { icon: Coins, text: "Idée de publication engageante" },
];

export const PRESETS_GRIOT = [
  { icon: MessageSquare, text: "Griot, donne-moi un conseil pour aujourd'hui" },
  { icon: Swords, text: "Griot, un proverbe pour mon cœur brisé ?" },
  { icon: Coins, text: "Griot, comment régler une palabre entre amis ?" },
  { icon: Zap, text: "Griot, raconte-moi l'histoire de Soundiata" },
  { icon: ImageIcon, text: "Griot, parle-moi d'une tradition du Mandé" },
];

export const GRIOT_FOLLOWUPS = [
  { label: "Approfondir", prompt: "Griotte, approfondis ta réponse avec des exemples concrets." },
  { label: "Résumé court", prompt: "Griotte, fais-moi un résumé en 3 points." },
  { label: "Un proverbe", prompt: "Griotte, donne-moi un proverbe sûr en lien avec ma question." },
  { label: "Son origine", prompt: "Griotte, explique le sens et l'origine, en distinguant ce qui est documenté de la tradition orale." },
];

/* ---------- Voix du Griot ---------- */

// Le moteur natif choisit une voix française correspondant au genre
// disponible sur l'appareil ; le serveur adapte aussi le style de réponse.
export const GRIOT_VOICE_PROFILES = {
  fatou: { label: "Fatou", hint: "douce et rassurante", gender: "female" },
  aminata: { label: "Aminata", hint: "posée et structurée", gender: "female" },
  mariam: { label: "Mariam", hint: "conteuse et chaleureuse", gender: "female" },
  awa: { label: "Awa", hint: "énergique et directe", gender: "female" },
  moussa: { label: "Moussa", hint: "calme et profond", gender: "male" },
  bakary: { label: "Bakary", hint: "précis et protecteur", gender: "male" },
  oumar: { label: "Oumar", hint: "vivant et encourageant", gender: "male" },
};

export const GRIOT_VOICE_LABELS = Object.fromEntries(
  Object.entries(GRIOT_VOICE_PROFILES).map(([key, profile]) => [
    key,
    `${profile.label} · ${profile.hint}`,
  ])
);

// Anciennes valeurs stockées → voix actuelles
export const GRIOT_VOICE_ALIASES = {
  normal: "fatou",
  conseil: "fatou",
  palabre: "aminata",
  histoire: "mariam",
};

/* ---------- Fournisseurs IA ---------- */

export const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  anthropic: "Claude",
  openai: "OpenAI",
  xai: "xAI",
  moonshot: "Moonshot",
};

/* ---------- Limites et clés de stockage ---------- */

export const HISTORY_LIMIT = 12;
export const STORED_LIMIT = 50;
export const MAX_INPUT_LENGTH = 4000;
export const REQUEST_TIMEOUT_MS = 45000;
export const STORAGE_PREFIX = "baaro_ai_chat_v1_";
export const SPEAK_KEY = "baaro_ai_autospeak";
export const GRIOT_KEY = "baaro_griot_mode";
export const GRIOT_VOICE_KEY = "baaro_griot_voice";

/* ---------- Prononciations (synthèse vocale uniquement) ---------- */

// Le texte affiché reste inchangé : seule la voix utilise ces remplacements.
export const SPEECH_PRONUNCIATIONS = [
  { pattern: /\bB\.?A\.?A\.?R\.?O\b/gi, spoken: "Barreau" },
  { pattern: /\bIA\b/g, spoken: "I A" },
];
