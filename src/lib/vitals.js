/**
 * Web Vitals légers (LCP, CLS, INP approximatif).
 * Place : src/lib/vitals.js
 *
 * Usage dans App.jsx ou main :
 *   import { reportVitals } from "./lib/vitals.js";
 *   useEffect(() => { reportVitals(); }, []);
 */

function send(name, value, extra = {}) {
  const payload = {
    name,
    value: Math.round(value),
    ...extra,
  };
  if (import.meta.env?.DEV) {
    console.debug("[vital]", payload);
  }
  // Optionnel : window.baaroAnalytics?.("web_vital", payload);
}

export function reportVitals() {
  if (typeof window === "undefined") return;
  if (!("PerformanceObserver" in window)) return;

  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) send("LCP", last.startTime);
    });
    lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    let cls = 0;
    const clsObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) cls += e.value;
      }
      send("CLS", cls * 1000);
    });
    clsObs.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    const inpObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 40) {
          send("INP", e.duration, { entryType: e.entryType });
        }
      }
    });
    inpObs.observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch {
    /* unsupported */
  }

  try {
    window.addEventListener("load", () => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        send("TTFB", nav.responseStart);
        send("DCL", nav.domContentLoadedEventEnd);
        send("LOAD", nav.loadEventEnd);
      }
    });
  } catch {
    /* ignore */
  }
}
