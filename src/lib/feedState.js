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

/**
 * Supprime les doublons par identifiant en conservant la première occurrence.
 * Les lignes sans identifiant sont conservées pour ne pas perdre de données.
 */
export function dedupeFeedRows(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (!row?.id) {
      result.push(row);
      continue;
    }
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}

/**
 * Ajoute une page au fil existant. Une ligne entrante remplace les données
 * d'un post déjà présent, sans déplacer sa position dans le fil.
 */
export function mergeFeedRows(previousRows = [], incomingRows = []) {
  const incomingById = new Map(
    incomingRows.filter((row) => row?.id).map((row) => [row.id, row])
  );
  const previousIds = new Set(previousRows.map((row) => row?.id).filter(Boolean));
  const merged = previousRows.map((row) =>
    row?.id && incomingById.has(row.id) ? incomingById.get(row.id) : row
  );

  for (const row of incomingRows) {
    if (!row?.id || !previousIds.has(row.id)) merged.push(row);
  }
  return dedupeFeedRows(merged);
}

export function mergeLatestFeedRows(previousRows = [], latestRows = []) {
  // La première page est prioritaire pour les posts déjà présents.
  return dedupeFeedRows([...latestRows, ...previousRows]);
}
