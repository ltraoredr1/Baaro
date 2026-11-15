// Classement « Pour toi » (v1 client). Profil stocké localement.
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
  const engagement = Math.min(1, ((Number(v.likes || 0) + 2 * Number(v.comments_count || 0)) / views) * 5);
  const watch = authorStats(v, p).avg;
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
