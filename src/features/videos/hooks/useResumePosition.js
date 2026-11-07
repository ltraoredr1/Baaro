// Reprise de lecture : mémorise la position de chaque vidéo sur l'appareil
// (localStorage, aucune donnée envoyée au serveur).

const STORAGE_KEY = "baaro:video-resume";
const MAX_ENTRIES = 100; // les plus anciennes sont supprimées
const MIN_SAVE_S = 3; // en dessous : on repart du début
const END_MARGIN_S = 3; // à moins de 3 s de la fin : vidéo considérée comme terminée

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const write = (data) => {
  try {
    const entries = Object.entries(data);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
      data = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // stockage plein ou indisponible : la reprise est simplement désactivée
  }
};

/** Position à reprendre (en secondes) ou 0. `duration` sert à valider la valeur. */
export function getResumePosition(id, duration) {
  if (id == null) return 0;
  const entry = read()[String(id)];
  const time = Number(entry?.t);
  if (!Number.isFinite(time) || time < MIN_SAVE_S) return 0;
  if (Number.isFinite(duration) && duration > 0 && time > duration - END_MARGIN_S) {
    return 0;
  }
  return time;
}

export function clearResumePosition(id) {
  if (id == null) return;
  const data = read();
  if (!(String(id) in data)) return;
  delete data[String(id)];
  write(data);
}

/** Enregistre la position ; supprime l'entrée si la vidéo est au début ou terminée. */
export function saveResumePosition(id, time, duration) {
  if (id == null || !Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) {
    return;
  }
  if (time < MIN_SAVE_S || time > duration - END_MARGIN_S) {
    clearResumePosition(id);
    return;
  }
  const data = read();
  data[String(id)] = { t: Math.round(time * 10) / 10, ts: Date.now() };
  write(data);
}
