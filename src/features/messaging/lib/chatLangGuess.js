/**
 * src/features/messaging/lib/chatLangGuess.js
 *
 * Devine, sans réseau, si un message est en français ou en bambara.
 * Sert au mode « traduction directe » : on évite d'envoyer au serveur un message
 * déjà écrit dans la langue du lecteur (économie de requêtes, de temps et de
 * données privées).
 *
 * Volontairement prudent : en cas de doute on répond `null` et le message est
 * alors traduit (le serveur renvoie le texte tel quel s'il est déjà dans la
 * langue cible). Fichier pur, sans dépendance : testable sous Node.
 */

// Lettres propres au bambara (alphabet latin N'Ko exclu : autre écriture).
const BM_SPECIAL = /[ɛɔɲŋƐƆƝŊ]/;
// Accents français non ambigus (è / ò sont souvent utilisés pour écrire ɛ / ɔ sans clavier adapté).
const FR_ACCENT = /[éêàùçœâîôûëïü]/i;

// Mots bambara distinctifs (peu ou pas utilisés en français).
// (Mots ambigus avec le français ou l'anglais exclus : te, ke, fo, bo, na, here…)
const BM_WORDS = new Set([
  "ka", "ye", "tɛ", "bɛ", "kɛ", "fɔ", "dɔrɔn", "ani", "aw", "bɛɛ",
  "fana", "kosɛbɛ", "kosebe", "kɔni", "barika", "hɛrɛ", "nin", "mun", "jɔn", "cogo",
  "tuma", "sɔrɔ", "sini", "kunu", "baara", "dumuni", "sugu", "kɛnɛ", "ɲɛ",
  "foli", "ɲɔgɔn", "nyogon", "mɔgɔ", "mogo", "fɛn", "kɔrɔ", "bɔ",
  "taa", "segin", "kuma", "faso", "sigi", "dɔnko", "dɔnkili",
]);
// Salutations bambara typiques (« i ni ce », « i ni sogoma »…).
const BM_GREETING = /\b(i|aw|an)\s+ni\s+(ce|sogoma|tile|su|baara|wula|yɔrɔ|yoro)\b/i;

const FR_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "est", "sont", "suis", "es", "je", "tu", "il", "elle",
  "nous", "vous", "ils", "elles", "pas", "pour", "que", "qui", "dans", "sur", "avec", "ce", "cette", "mon", "ma",
  "mes", "ton", "ta", "tes", "son", "sa", "ses", "bonjour", "bonsoir", "salut", "merci", "oui", "non", "comment",
  "très", "bien", "aussi", "mais", "où", "quand", "comme", "ça", "ca", "être", "avoir", "fait", "au", "aux",
  "demain", "aujourd'hui", "hier", "svp", "stp", "rien", "tout", "tous", "ici", "là", "alors", "donc", "parce",
  "voilà", "voila", "moi", "toi", "lui", "eux", "ai", "as", "a", "avez", "allez", "va", "vais",
]);

// Mots neutres : rien à traduire.
const NEUTRAL = new Set(["ok", "okay", "lol", "mdr", "ptdr", "haha", "hahaha", "hihi", "hmm", "hum", "ah", "oh", "wow", "yes", "👍"]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}'’\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ""))
    .filter(Boolean);
}

/**
 * @param {string} text
 * @returns {"bm"|"fr"|"neutral"|null}  null = incertain
 */
export function guessLang(text) {
  const raw = String(text || "");
  const tokens = tokenize(raw);
  if (tokens.length === 0) return "neutral";

  // Mots seuls ou élisions courtes de l'écriture bambara : n', k'a → on regarde le mot après l'apostrophe.
  const words = tokens.flatMap((t) => (t.includes("'") || t.includes("’") ? t.split(/['’]/) : [t])).filter(Boolean);

  if (words.every((w) => NEUTRAL.has(w) || /^\p{N}+$/u.test(w))) return "neutral";
  if (BM_SPECIAL.test(raw)) return "bm";
  if (BM_GREETING.test(raw)) return "bm";

  let bm = 0;
  let fr = 0;
  for (const w of words) {
    if (BM_WORDS.has(w) && !FR_WORDS.has(w)) bm += 1;
    else if (FR_WORDS.has(w)) fr += 1;
  }
  const frAccent = FR_ACCENT.test(raw);
  if (frAccent) fr += 1;

  if (bm >= 2 && bm > fr) return "bm";
  if (bm >= 1 && fr === 0 && bm / words.length >= 0.5) return "bm";
  if (fr >= 2 && fr > bm) return "fr";
  if (fr >= 1 && bm === 0 && words.length <= 3) return "fr";
  return null;
}

/**
 * Faut-il envoyer ce message au service de traduction pour le lire en `target` ?
 * @param {string} text
 * @param {string} target  code langue du lecteur ("fr", "bm", "en"…)
 */
export function needsTranslation(text, target) {
  const clean = String(text || "").replace(/https?:\/\/\S+/g, "").trim();
  if ((clean.match(/\p{L}/gu) || []).length < 2) return false;
  const g = guessLang(clean);
  if (g === "neutral") return false;
  if (g === target) return false;
  return true;
}
