/**
 * Découpe un WebVTT en blocs sans perdre les horodatages.
 * Une seule implémentation JavaScript est conservée pour éviter le coût
 * du lancement d’un processus Rust à chaque parsing.
 */
export function parseVtt(vtt) {
  const normalized = String(vtt || "")
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .trim();

  if (!/^WEBVTT(?:\s|$)/.test(normalized)) {
    throw new Error("La transcription ne contient pas un WebVTT valide");
  }

  return normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));

    if (timingIndex < 0) {
      return { raw: block, timing: null, text: [] };
    }

    return {
      raw: null,
      prefix: lines.slice(0, timingIndex),
      timing: lines[timingIndex],
      text: lines.slice(timingIndex + 1),
    };
  });
}
