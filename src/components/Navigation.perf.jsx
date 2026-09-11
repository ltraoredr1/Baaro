/**
 * EXEMPLE d'intégration prefetch — ne remplace pas forcément tout Navigation.jsx.
 * Copie les handlers onMouseEnter / onTouchStart sur tes boutons d'onglets existants.
 *
 * Import en tête de Navigation.jsx :
 *   import { prefetchTab } from "../lib/prefetchTab.js";
 */
import { prefetchTab } from "../lib/prefetchTab.js";

/**
 * Props d'un item de nav à fusionner avec ton bouton existant :
 *
 * onClick={() => setActiveTab(id)}
 * onMouseEnter={() => prefetchTab(id)}
 * onTouchStart={() => prefetchTab(id)}
 */
export function navPrefetchHandlers(tabId, setActiveTab) {
  return {
    onClick: () => setActiveTab?.(tabId),
    onMouseEnter: () => prefetchTab(tabId),
    onTouchStart: () => prefetchTab(tabId),
  };
}
