/**
 * src/features/messaging/lib/translateQueue.js
 *
 * File d'attente des traductions de chat (logique pure, testable sous Node).
 *
 * - Au plus `concurrency` traductions en même temps.
 * - Au plus `maxPerWindow` démarrages par fenêtre glissante (le serveur limite à
 *   30 requêtes/min par utilisateur : on garde une marge pour les clics manuels).
 * - LIFO : les messages les plus récents (en bas de la conversation) sont traduits
 *   en premier, c'est ce que le lecteur regarde.
 * - Pause automatique sur une erreur 429, puis nouvel essai.
 * - Mémoire seulement (jamais sur disque) : ce sont des messages chiffrés de bout en bout.
 * - Plusieurs demandeurs du même texte partagent une seule requête. Chacun peut
 *   se désister (signal) sans gêner les autres ; si tous se désistent avant le
 *   départ, rien n'est envoyé.
 */

function abortError() {
  return Object.assign(new Error("Traduction annulée."), { name: "AbortError" });
}

/**
 * @param {{
 *   translate: (text: string, lang: string) => Promise<string>,
 *   concurrency?: number, maxPerWindow?: number, windowMs?: number,
 *   maxRetries?: number, retryPauseMs?: number, cacheMax?: number,
 *   now?: () => number, setTimer?: typeof setTimeout,
 * }} opts
 */
export function createTranslateQueue({
  translate,
  concurrency = 2,
  maxPerWindow = 24,
  windowMs = 60_000,
  maxRetries = 2,
  retryPauseMs = 20_000,
  cacheMax = 300,
  now = () => Date.now(),
  setTimer = setTimeout,
} = {}) {
  const cache = new Map(); // "lang|texte" -> traduction
  const jobs = new Map(); // "lang|texte" -> job en attente ou en cours
  const pending = []; // pile (LIFO) des jobs pas encore partis
  const starts = []; // horodatages des démarrages récents
  let active = 0;
  let pausedUntil = 0;
  let timer = null;
  let pumpQueued = false;

  const keyOf = (text, lang) => `${lang}|${text}`;

  function schedule(ms) {
    if (timer) return;
    timer = setTimer(() => {
      timer = null;
      pump();
    }, Math.max(10, ms));
  }

  function remember(key, value) {
    if (cache.size >= cacheMax) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  }

  async function run(job) {
    try {
      const out = await translate(job.text, job.lang);
      remember(job.key, out);
      jobs.delete(job.key);
      job.resolve(out);
    } catch (err) {
      if (err?.status === 429 && job.attempts < maxRetries) {
        job.attempts += 1;
        pausedUntil = now() + retryPauseMs;
        pending.push(job); // on le retente dès la fin de la pause
      } else {
        jobs.delete(job.key);
        job.reject(err);
      }
    } finally {
      active -= 1;
      pump();
    }
  }

  function pump() {
    while (active < concurrency && pending.length > 0) {
      const t = now();
      if (t < pausedUntil) return schedule(pausedUntil - t);
      while (starts.length && t - starts[0] >= windowMs) starts.shift();
      if (starts.length >= maxPerWindow) return schedule(windowMs - (t - starts[0]) + 5);

      const job = pending.pop();
      if (job.live <= 0) {
        // Plus personne n'attend ce résultat : on n'envoie rien.
        jobs.delete(job.key);
        job.reject(abortError());
        continue;
      }
      starts.push(t);
      active += 1;
      run(job);
    }
  }

  function queuePump() {
    // On laisse arriver toutes les demandes du même instant (ouverture d'une
    // conversation : tous les messages se montent d'un coup) avant de démarrer,
    // pour que le plus récent passe réellement en premier.
    if (pumpQueued) return;
    pumpQueued = true;
    Promise.resolve().then(() => {
      pumpQueued = false;
      pump();
    });
  }

  return {
    /** Traduction déjà connue (sans réseau) ou undefined. */
    peek(text, lang) {
      return cache.get(keyOf(text, lang));
    },

    /** @returns {Promise<string>} */
    enqueue(text, lang, { signal } = {}) {
      const key = keyOf(text, lang);
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      if (signal?.aborted) return Promise.reject(abortError());

      let job = jobs.get(key);
      if (!job) {
        job = { text, lang, key, attempts: 0, live: 0 };
        job.promise = new Promise((resolve, reject) => {
          job.resolve = resolve;
          job.reject = reject;
        });
        job.promise.catch(() => {}); // évite un « unhandled rejection » si tout le monde se désiste
        jobs.set(key, job);
        pending.push(job);
        queuePump();
      }

      job.live += 1;
      const current = job;
      return new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          current.live -= 1;
          reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        current.promise.then(
          (v) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            resolve(v);
          },
          (e) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(e);
          }
        );
      });
    },

    clear() {
      cache.clear();
    },

    /** Pour les tests. */
    stats() {
      return { active, pending: pending.length, cached: cache.size };
    },
  };
}
