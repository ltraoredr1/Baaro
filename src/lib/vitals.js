/**
 * Web Vitals légers :
 * - LCP
 * - CLS
 * - INP approximatif
 * - TTFB
 * - DCL
 * - LOAD
 *
 * L'initialisation est protégée contre les doublons.
 */

let initialized = false;

function send(name, value, extra = {}) {
  if (!Number.isFinite(value)) return;

  const payload = {
    name,
    value,
    ...extra,
  };

  if (import.meta.env?.DEV) {
    console.debug("[vital]", payload);
  }

  // Point d'intégration analytique optionnel.
  try {
    window.baaroAnalytics?.("web_vital", payload);
  } catch {
    // L'analytics ne doit jamais casser l'application.
  }
}

export function reportVitals() {
  if (typeof window === "undefined") return;
  if (initialized) return;

  initialized = true;

  if (!("PerformanceObserver" in window)) return;

  // --------------------------------------------------
  // LCP
  // --------------------------------------------------
  try {
    let lastLcp = null;

    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();

      if (entries.length > 0) {
        lastLcp = entries[entries.length - 1];

        if (lastLcp) {
          send("LCP", Math.round(lastLcp.startTime));
        }
      }
    });

    lcpObs.observe({
      type: "largest-contentful-paint",
      buffered: true,
    });
  } catch {
    // Navigateur non compatible.
  }

  // --------------------------------------------------
  // CLS
  // --------------------------------------------------
  try {
    let cls = 0;

    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      }

      // CLS est une valeur sans unité.
      send("CLS", Math.round(cls * 1000) / 1000);
    });

    clsObs.observe({
      type: "layout-shift",
      buffered: true,
    });
  } catch {
    // Navigateur non compatible.
  }

  // --------------------------------------------------
  // INP approximatif
  // --------------------------------------------------
  try {
    const inpObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 40) {
          send("INP", Math.round(entry.duration), {
            entryType: entry.entryType,
          });
        }
      }
    });

    inpObs.observe({
      type: "event",
      buffered: true,
      durationThreshold: 40,
    });
  } catch {
    // Navigateur non compatible.
  }

  // --------------------------------------------------
  // Navigation timing
  // --------------------------------------------------
  const reportNavigation = () => {
    try {
      const navigation = performance.getEntriesByType("navigation")[0];

      if (!navigation) return;

      send("TTFB", Math.round(navigation.responseStart));
      send(
        "DCL",
        Math.round(navigation.domContentLoadedEventEnd)
      );
      send("LOAD", Math.round(navigation.loadEventEnd));
    } catch {
      // Ignore les navigateurs non compatibles.
    }
  };

  try {
    if (document.readyState === "complete") {
      reportNavigation();
    } else {
      window.addEventListener("load", reportNavigation, {
        once: true,
      });
    }
  } catch {
    // Ignore.
  }
}
