// Comptes mémorisés sur l'appareil (numéro / e-mail uniquement, jamais le mot de passe).
// La clé ne commence pas par "baaro_cache_" : « Vider le cache » n'y touche pas,
// et la déconnexion non plus.
const KEY = "baaro_known_accounts";
const MAX = 5;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { phone: raw.phone || [], email: raw.email || [] };
  } catch {
    return { phone: [], email: [] };
  }
}

export function getKnownAccounts(type) {
  return read()[type] || [];
}

export function rememberAccount(type, value) {
  const v = String(value || "").trim();
  if (!v) return;
  // L'e-mail technique des comptes téléphone n'est jamais mémorisé
  if (type === "email" && v.toLowerCase().endsWith("@baaro.app")) return;
  try {
    const all = read();
    all[type] = [v, ...all[type].filter((x) => x !== v)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function forgetAccount(type, value) {
  try {
    const all = read();
    all[type] = all[type].filter((x) => x !== value);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

// Propose au gestionnaire de mots de passe du navigateur d'enregistrer l'accès.
// Le mot de passe n'est jamais stocké par l'application elle-même.
export async function savePasswordCredential(id, password) {
  try {
    if (window.PasswordCredential && navigator.credentials?.store) {
      await navigator.credentials.store(
        new window.PasswordCredential({ id, password, name: id })
      );
    }
  } catch {}
}
