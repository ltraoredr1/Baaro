export function mergeLatestFeedRows(previousRows = [], latestRows = []) {
  const incomingIds = new Set(latestRows.map((row) => row?.id).filter(Boolean));
  return [...latestRows, ...previousRows.filter((row) => !incomingIds.has(row?.id))];
}
