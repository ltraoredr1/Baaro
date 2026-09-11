/**
 * Initialisation perf au démarrage de l'app.
 * Place : src/lib/initPerf.js
 *
 * Dans App.jsx ou MainShell.jsx :
 *   import { initPerf } from "./lib/initPerf.js";
 *   useEffect(() => { initPerf(); }, []);
 */
import { reportVitals } from "./vitals.js";
import { prefetchTabs } from "./prefetchTab.js";

export function initPerf({
  tabs = ["messages", "shop", "wallet", "videos"],
} = {}) {
  reportVitals();
  prefetchTabs(tabs);
}
