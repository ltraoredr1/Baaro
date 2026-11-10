const localTails = new Map();

/** Sérialise les mutations de file sur le compte actif entre onglets compatibles. */
export async function withOfflineQueueLock(name, operation) {
  const lockName = `baaro:${String(name)}`;
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(lockName, { mode: "exclusive" }, operation);
  }

  // Repli pour moteurs sans Web Locks : protège au moins les appels du même runtime.
  const previous = localTails.get(lockName) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  localTails.set(lockName, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localTails.get(lockName) === current) localTails.delete(lockName);
  }
}
