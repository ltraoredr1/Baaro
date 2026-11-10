/**
 * Planifie l'éviction LRU jusqu'au plafond, sans toucher aux entrées protégées.
 * L'ordre du tableau départage les horodatages d'accès identiques de façon stable.
 * @returns {{ keysToEvict: string[], protectedKeyToEvict: string|null, resultingBytes: number }}
 */
export function planLruEvictions(entries, maxBytes, protectedKeys = []) {
  const limit = Math.max(0, Number(maxBytes) || 0);
  let remainingBytes = entries.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.bytes) || 0),
    0
  );
  if (remainingBytes <= limit) {
    return { keysToEvict: [], protectedKeyToEvict: null, resultingBytes: remainingBytes };
  }

  const protectedSet = new Set(protectedKeys.filter(Boolean));
  const incomingProtectedKey = protectedKeys.find(Boolean) || null;
  if (incomingProtectedKey) {
    const protectedBytes = entries
      .filter((entry) => protectedSet.has(entry.key))
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.bytes) || 0), 0);
    if (protectedBytes > limit) {
      const incomingBytes = Math.max(
        0,
        Number(entries.find((entry) => entry.key === incomingProtectedKey)?.bytes) || 0
      );
      return {
        keysToEvict: [],
        protectedKeyToEvict: incomingProtectedKey,
        resultingBytes: Math.max(0, remainingBytes - incomingBytes),
      };
    }
  }

  const evictable = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !protectedSet.has(entry.key))
    .sort((a, b) => {
      const accessDelta = (Number(a.entry.lastAccessedAt) || 0) - (Number(b.entry.lastAccessedAt) || 0);
      return accessDelta || a.index - b.index;
    });

  const keysToEvict = [];
  for (const { entry } of evictable) {
    if (remainingBytes <= limit) break;
    keysToEvict.push(entry.key);
    remainingBytes -= Math.max(0, Number(entry.bytes) || 0);
  }

  // Le plafond doit rester strict si les données changent pendant la planification.
  const protectedKeyToEvict = remainingBytes > limit ? protectedKeys[0] || null : null;
  if (protectedKeyToEvict) {
    const protectedEntry = entries.find((entry) => entry.key === protectedKeyToEvict);
    if (protectedEntry) remainingBytes -= Math.max(0, Number(protectedEntry.bytes) || 0);
  }

  return { keysToEvict, protectedKeyToEvict, resultingBytes: Math.max(0, remainingBytes) };
}
