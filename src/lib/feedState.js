export function attachRepostCounts(rows = [], repostRows = []) {
  const counts = new Map();
  for (const row of repostRows) {
    if (!row?.post_id) continue;
    counts.set(row.post_id, (counts.get(row.post_id) || 0) + 1);
  }
  return rows.map((row) => {
    if (!row?.id) return row;
    return { ...row, reposts_count: counts.get(row.id) || 0 };
  });
}

export function mergeLatestFeedRows(previousRows = [], latestRows = []) {
  const incomingIds = new Set(latestRows.map((row) => row?.id).filter(Boolean));
  return [...latestRows, ...previousRows.filter((row) => !incomingIds.has(row?.id))];
}
