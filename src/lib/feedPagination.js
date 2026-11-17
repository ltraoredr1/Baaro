// DÉPRÉCIÉ : Le classement et le filtrage sont désormais gérés côté serveur via get_feed_posts RPC.
// Ce fichier est conservé uniquement pour éviter les erreurs d'import, mais ne contient plus de logique active.

export function fetchFeedPage() {
  console.warn("[feedPagination] DÉPRÉCIÉ : Utilisez useCursorFeed avec le RPC serveur.");
  return Promise.resolve({ rows: [], hasMore: false });
}

export function rankRows(rows) {
  console.warn("[feedPagination] DÉPRÉCIÉ : Le classement se fait en base de données.");
  return rows;
}

export function getFollowingIds() {
  console.warn("[feedPagination] DÉPRÉCIÉ : Géré par le hook useCursorFeed.");
  return Promise.resolve({ userId: null, ids: new Set() });
}
