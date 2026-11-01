/**
 * Mode Zéro Data — boîte d'envoi persistante des messages texte.
 *
 * Quand il n'y a pas de réseau, le message est gardé ici (localStorage) au lieu d'être
 * perdu ou marqué « échec ». Il repart automatiquement dès que la connexion revient,
 * même si l'app a été fermée entre-temps. L'envoi réel réutilise le même
 * client_message_id : la contrainte unique côté base empêche tout doublon.
 *
 * Le texte est chiffré de bout en bout AU MOMENT de l'envoi réseau (pas ici), donc la
 * boîte d'envoi contient le texte en clair sur l'appareil de l'expéditeur uniquement,
 * le temps de l'attente. Elle est vidée dès que le message est parti.
 */
const KEY_PREFIX = "baaro_outbox_v1:";
const MAX_ITEMS = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

const keyFor = (userId) => `${KEY_PREFIX}${userId || "anon"}`;

function read(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || "[]");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw.filter((m) => m && m.clientMessageId && now - (m.queuedAt || 0) < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function write(userId, items) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(items.slice(-MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent("baaro:outbox"));
  } catch {
    /* quota plein : on ne casse jamais l'envoi pour ça */
  }
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Une erreur qui ressemble à une coupure réseau (et non à un refus du serveur). */
export function isNetworkError(err) {
  if (isOffline()) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    err?.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

export function enqueueOutbox(userId, item) {
  const items = read(userId).filter((m) => m.clientMessageId !== item.clientMessageId);
  items.push({ ...item, queuedAt: item.queuedAt || Date.now(), sms: item.sms || null });
  write(userId, items);
}

export function updateOutbox(userId, clientMessageId, patch) {
  write(
    userId,
    read(userId).map((m) => (m.clientMessageId === clientMessageId ? { ...m, ...patch } : m))
  );
}

export function removeFromOutbox(userId, clientMessageId) {
  write(
    userId,
    read(userId).filter((m) => m.clientMessageId !== clientMessageId)
  );
}

export function getOutbox(userId, conversationId) {
  const all = read(userId);
  return conversationId ? all.filter((m) => m.conversationId === conversationId) : all;
}

export function getOutboxSize(userId) {
  return read(userId).length;
}
