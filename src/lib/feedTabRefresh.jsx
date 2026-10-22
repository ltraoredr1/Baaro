import { useState, useEffect } from "react";

/** Événement écouté par FeedTab : recharge le fil et remonte en haut */
export const FEED_REFRESH_EVENT = "baaro:feed-refresh";

/** Événement qui déclenche l'animation de l'icône « Fil » */
export const FEED_PULSE_EVENT = "baaro:feed-tab-pulse";

/**
 * Utilisé dans Navigation.jsx : true pendant l'animation de l'icône « Fil ».
 * Les deux événements sont envoyés par MainShell au double appui sur l'onglet Fil.
 */
export function useFeedTabPulse() {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let timer;
    const run = () => {
      setPulse(false);
      // relance l'animation même si elle est déjà en cours
      requestAnimationFrame(() => {
        setPulse(true);
        clearTimeout(timer);
        timer = setTimeout(() => setPulse(false), 1300);
      });
    };
    window.addEventListener(FEED_PULSE_EVENT, run);
    return () => {
      window.removeEventListener(FEED_PULSE_EVENT, run);
      clearTimeout(timer);
    };
  }, []);

  return pulse;
}

/**
 * Styles de l'animation (rendus une fois dans MainShell) :
 * l'icône grossit d'un coup, devient dorée puis teal, rétrécit lentement
 * et revient à sa couleur normale.
 */
export function TabPulseStyles() {
  return (
    <style>{`
      @keyframes baaro-tab-pulse {
        0%   { transform: scale(1);    color: inherit; }
        15%  { transform: scale(1.6);  color: #D4AF37; }
        55%  { transform: scale(1.25); color: #14B8A6; }
        100% { transform: scale(1);    color: inherit; }
      }
      .baaro-tab-pulse {
        display: inline-flex;
        animation: baaro-tab-pulse 1.2s cubic-bezier(.22,.8,.3,1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .baaro-tab-pulse { animation: none; }
      }
    `}</style>
  );
}
