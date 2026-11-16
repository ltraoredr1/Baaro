/** Helpers d'affichage temporel pour les stories. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Relatif court en français : "à l'instant", "il y a 3 min", "il y a 2 h", "il y a 1 j".
 * @param {string|Date|number} date
 * @param {number} [nowMs]
 */
export function formatRelativePast(date, nowMs = Date.now()) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, nowMs - t);
  if (diff < MINUTE) return "à l'instant";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `il y a ${m} min`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `il y a ${h} h`;
  }
  const d = Math.floor(diff / DAY);
  return d === 1 ? 'il y a 1 j' : `il y a ${d} j`;
}

/**
 * Temps restant avant expiration : "dans 3 min", "dans 5 h", "expirée".
 * @param {string|Date|number} expiresAt
 * @param {number} [nowMs]
 */
export function formatTimeLeft(expiresAt, nowMs = Date.now()) {
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = t - nowMs;
  if (diff <= 0) return 'expirée';
  if (diff < MINUTE) return 'dans < 1 min';
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `dans ${m} min`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    const m = Math.floor((diff % HOUR) / MINUTE);
    return m > 0 ? `dans ${h} h ${m} min` : `dans ${h} h`;
  }
  const d = Math.floor(diff / DAY);
  return d === 1 ? 'dans 1 j' : `dans ${d} j`;
}

/**
 * Ligne compacte pour le propriétaire :
 * "Publiée il y a 2 h · expire dans 22 h"
 * ou "Publiée il y a 1 j · expirée"
 */
export function formatOwnerStoryMeta(story, nowMs = Date.now()) {
  if (!story) return '';
  const published = formatRelativePast(story.publish_at || story.created_at, nowMs);
  const left = formatTimeLeft(story.expires_at, nowMs);
  const publishedLabel = published.startsWith('il y a') || published === "à l'instant"
    ? `Publiée ${published}`
    : `Publiée ${published}`;
  if (left === 'expirée') return `${publishedLabel} · expirée`;
  return `${publishedLabel} · expire ${left}`;
}

/**
 * Date/heure absolue courte (fr).
 */
export function formatAbsoluteShort(date) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
