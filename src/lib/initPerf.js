/**
 * Initialisation des optimisations de performance au démarrage.
 *
 * - Web Vitals
 * - Préchargement des onglets importants
 *
 * L'initialisation est protégée contre les appels multiples.
 */

import { reportVitals } from "./vitals.js";
import { prefetchTabs } from "./prefetchTab.js";
import { shouldPrefetch } from "./appSettings.js";

let initialized = false;

export function initPerf({
  tabs = ["messages", "shop", "videos"],
} = {}) {
  if (initialized) return;

  initialized = true;

  reportVitals();
  if (shouldPrefetch()) prefetchTabs(tabs);
}
