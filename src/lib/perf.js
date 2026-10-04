/**
 * Utilitaires perf / robustesse BAARO.
 */

/** Debounce générique (recherche, resize). */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Throttle (scroll, like spamming côté UI). */
export function throttle(fn, wait = 400) {
  let last = 0;
  let pending;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(pending);
      pending = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, wait - (now - last));
    }
  };
}

/**
 * Retry avec backoff (réseau instable Afrique / mobile).
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, baseMs?: number }} opts
 */
export async function withRetry(fn, { retries = 3, baseMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

/** Mémorise le dernier onglet pour reprise de session. */
const TAB_KEY = "baaro:last_tab";

export function saveLastTab(tabId) {
  try {
    localStorage.setItem(TAB_KEY, tabId);
  } catch {
    /* private mode */
  }
}

export function loadLastTab(fallback = "feed") {
  try {
    return localStorage.getItem(TAB_KEY) || fallback;
  } catch {
    return fallback;
  }
}
