import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "baaro:video-settings";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
export const SAVER_MODES = ["auto", "on", "off"];

const DEFAULTS = {
  dataSaver: "auto",
  autoNext: true,
  speed: 1,
  compressUploads: true,
};

function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    return {
      dataSaver: SAVER_MODES.includes(raw.dataSaver)
        ? raw.dataSaver
        : DEFAULTS.dataSaver,
      autoNext:
        typeof raw.autoNext === "boolean"
          ? raw.autoNext
          : DEFAULTS.autoNext,
      speed: SPEEDS.includes(raw.speed) ? raw.speed : DEFAULTS.speed,
      compressUploads:
        typeof raw.compressUploads === "boolean"
          ? raw.compressUploads
          : DEFAULTS.compressUploads,
    };
  } catch {
    return DEFAULTS;
  }
}

function getConnection() {
  if (typeof navigator === "undefined") return null;

  return (
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null
  );
}

function isSlowNetwork() {
  const connection = getConnection();

  if (!connection) return false;

  return (
    !!connection.saveData ||
    /^(slow-2g|2g|3g)$/.test(connection.effectiveType || "")
  );
}

/**
 * Réglages de lecture persistants + détection du réseau.
 * dataSaverActive est vrai si le mode est « Activé »,
 * ou « Auto » avec un réseau lent / le mode économie de données du téléphone.
 */
export function usePlaybackSettings() {
  const [settings, setSettings] = useState(readSettings);
  const [slow, setSlow] = useState(isSlowNetwork);

  useEffect(() => {
    const connection = getConnection();

    if (!connection?.addEventListener) return undefined;

    const handleChange = () => setSlow(isSlowNetwork());

    connection.addEventListener("change", handleChange);

    return () => connection.removeEventListener("change", handleChange);
  }, []);

  const update = useCallback((patch) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible (navigation privée) : on garde en mémoire
      }

      return next;
    });
  }, []);

  const dataSaverActive =
    settings.dataSaver === "on" ||
    (settings.dataSaver === "auto" && slow);

  return { settings, update, dataSaverActive };
}

export default usePlaybackSettings;
