import { supabase } from "../../../supabaseClient.js";

// Classement « Pour toi ». Profil local, synchronisé avec Supabase (video_watch_events).
const KEY = "baaro:feed-profile:v1";
const W = { interest: 0.3, engagement: 0.2, watch: 0.25, discovery: 0.1, fresh: 0.15 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { tags: p.tags || {}, authors: p.authors || {}, seen: p.seen || {}, fav: p.fav || {} };
  } catch {
    return { tags: {}, authors: {}, seen: {}, fav: {} };
  }
}

function saveProfile(p) {
  try {
    const top = (o, n) => Object.fromEntries(Object.entries(o).slice(-n));
    localStorage.setItem(
      KEY,
      JSON.stringify({ tags: top(p.tags, 150), authors: top(p.authors, 200), seen: top(p.seen, 300), fav: top(p.fav || {}, 200) })
    );
  } catch {
    /* stockage indisponible */
  }
}

export function extractTags(v) {
  const text = `${v?.title || ""} ${v?.description || ""}`.toLowerCase();
  return [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) || [])];
}

// À appeler quand l'utilisateur quitte une vidéo (ratio = part regardée, 0..1).
export function recordWatch(video, ratio) {
  if (!video) return;
  const r = clamp(Number(ratio) || 0, 0, 1);
  if (r < 0.03) return;
  const p = loadProfile();
  p.seen[video.id] = r;
  const delta = r - 0.3; // regardé jusqu'au bout = +, zappé = −
  for (const t of extractTags(video)) p.tags[t] = clamp((p.tags[t] || 0) + delta, -2, 5);
  const a = p.authors[video.author_id] || [0, 0];
  p.authors[video.author_id] = [a[0] + 1, a[1] + r];
  saveProfile(p);
  // Synchronisation serveur, silencieuse (ignorée si non connecté).
  try {
    supabase.rpc("record_video_watch", { p_video_id: video.id, p_ratio: r }).then(null, () => {});
  } catch {
    /* hors ligne */
  }
}

function authorStats(v, p) {
  const [n, sum] = p.authors[v.author_id] || [0, 0];
  return { n, avg: n ? sum / n : 0.5 };
}

function discoveryScore(v, p) {
  const { n } = authorStats(v, p);
  return (1 / (1 + Math.log10(1 + Number(v.views || 0)))) * (1 / (1 + n * 0.5));
}

export function scoreVideo(v, p) {
  const tags = extractTags(v);
  const interest = tags.length
    ? clamp(0.5 + tags.reduce((s, t) => s + (p.tags[t] || 0), 0) / tags.length / 4, 0, 1)
    : 0.5;
  const views = Math.max(Number(v.views || 0), 20);
  const engagement = Math.min(1, ((Number(v.likes || 0) + 2 * Number(v.comments_count || 0) + 3 * Number(v.shares_count || 0) + 3 * Number(v.saves_count || 0)) / views) * 5);
  const st = authorStats(v, p);
  const gCount = Number(v.watch_ratio_count || 0);
  const watch = st.n
    ? st.avg
    : gCount >= 5
      ? clamp(Number(v.watch_ratio_sum || 0) / gCount, 0, 1)
      : 0.5;
  const ageH = (Date.now() - new Date(v.created_at).getTime()) / 36e5;
  const fresh = Math.max(0.2, Math.pow(0.5, (Number.isFinite(ageH) ? ageH : 0) / 48));
  const score =
    W.interest * clamp(interest + (p.fav?.[v.author_id] ? 0.2 : 0), 0, 1) + W.engagement * engagement + W.watch * watch +
    W.discovery * discoveryScore(v, p) + W.fresh * fresh;
  return p.seen[v.id] != null ? score / 5 : score; // déjà vue : rétrogradée
}

export function rankForYou(list, { pinnedId = null, profile = loadProfile() } = {}) {
  let pool = list
    .map((v) => ({ v, s: scoreVideo(v, profile), d: discoveryScore(v, profile) }))
    .sort((a, b) => b.s - a.s);
  const out = [];
  const pin = pinnedId != null ? pool.find((x) => String(x.v.id) === String(pinnedId)) : null;
  if (pin) {
    out.push(pin.v);
    pool = pool.filter((x) => x !== pin);
  }
  while (pool.length) {
    const last = out[out.length - 1]?.author_id;
    const discoverySlot = (out.length + 1) % 5 === 0; // 1 vidéo sur 5
    const cand = discoverySlot ? [...pool].sort((a, b) => b.d - a.d) : pool;
    const pick = cand.find((x) => x.v.author_id !== last) || cand[0]; // pas 2 fois le même créateur
    out.push(pick.v);
    pool = pool.filter((x) => x !== pick);
  }
  return out;
}

/** Classement Tendance BAARO. */
export function rankTrending(list, { profile = loadProfile() } = {}) {
  if (!Array.isArray(list) || list.length < 2) return list || [];
  const maxViews = Math.max(1, ...list.map(v => Math.max(0, Number(v.views || 0))));
  return list.map(video => {
    const views = Math.max(0, Number(video.views || 0));
    const likes = Math.max(0, Number(video.likes || 0));
    const comments = Math.max(0, Number(video.comments_count || 0));
    const shares = Math.max(0, Number(video.shares_count || 0));
    const saves = Math.max(0, Number(video.saves_count || 0));
    const popularity = Math.log1p(views) / Math.log1p(maxViews);
    const engagement = clamp((likes + comments * 2 + shares * 3 + saves * 3) / Math.max(views, 20), 0, 1);
    const count = Math.max(0, Number(video.watch_ratio_count || 0));
    const watch = count > 0 ? clamp(Number(video.watch_ratio_sum || 0) / count, 0, 1) : 0.5;
    const timestamp = new Date(video.created_at || 0).getTime();
    const ageHours = Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3600000) : Infinity;
    const freshness = Number.isFinite(ageHours) ? Math.pow(0.5, ageHours / 36) : 0;
    const penalty = profile.seen?.[video.id] != null ? 0.72 : 1;
    const total = popularity * 0.20 + engagement * 0.35 + watch * 0.25 + freshness * 0.20;
    return { video, score: total * penalty };
  }).sort((a, b) => b.score - a.score).map(item => item.video);
}

// Vidéos enregistrées par l'utilisateur : signal d'intérêt fort.
// rows = lignes video_bookmarks avec la vidéo jointe (author_id, title, description).
export function recordBookmarks(rows) {
  const p = loadProfile();
  for (const row of rows || []) {
    const v = row?.videos;
    if (!v) continue;
    for (const t of extractTags(v)) p.tags[t] = clamp((p.tags[t] || 0) + 1.5, -2, 5);
    if (v.author_id) p.fav[v.author_id] = 1;
  }
  saveProfile(p);
}

// Historique de visionnage venant du serveur (autre appareil, cache vidé).
// Les vidéos déjà connues localement sont ignorées : pas de double comptage.
export function syncWatchHistory(rows) {
  const p = loadProfile();
  for (const row of rows || []) {
    const v = row?.videos;
    if (!v || p.seen[row.video_id] != null) continue;
    const r = clamp(Number(row.ratio) || 0, 0, 1);
    p.seen[row.video_id] = r;
    for (const t of extractTags(v)) p.tags[t] = clamp((p.tags[t] || 0) + (r - 0.3), -2, 5);
    if (v.author_id) {
      const a = p.authors[v.author_id] || [0, 0];
      p.authors[v.author_id] = [a[0] + 1, a[1] + r];
    }
  }
  saveProfile(p);
}
