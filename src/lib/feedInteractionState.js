export function buildInteractionMap({ likes = [], shares = [], bookmarks = [], userId = null } = {}) {
  const map = new Map();
  for (const row of likes) {
    if (!row?.post_id) continue;
    const current = map.get(row.post_id) || { reactionCount: 0, reaction: null, shareCount: 0, saved: false };
    current.reactionCount += 1;
    if (row.user_id && row.user_id === userId) current.reaction = "like";
    map.set(row.post_id, current);
  }
  for (const row of shares) {
    if (!row?.post_id) continue;
    const current = map.get(row.post_id) || { reactionCount: 0, reaction: null, shareCount: 0, saved: false };
    const aggregateCount = Number(row.share_count);
    current.shareCount += Number.isFinite(aggregateCount) && aggregateCount >= 0
      ? Math.trunc(aggregateCount)
      : 1;
    map.set(row.post_id, current);
  }
  for (const row of bookmarks) {
    if (!row?.post_id) continue;
    const current = map.get(row.post_id) || { reactionCount: 0, reaction: null, shareCount: 0, saved: false };
    current.saved = true;
    map.set(row.post_id, current);
  }
  return map;
}
