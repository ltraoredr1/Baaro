import { parseVttNative } from "./native.mjs";

/**
 * Découpe le WebVTT en blocs sans perdre les horodatages.
 * Version JavaScript de référence (et de repli) : le binaire Rust
 * `baaro-media vtt-parse` doit produire exactement le même résultat.
 */
export function parseVttJs(vtt) {
  const normalized = String(vtt || "")
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .trim();

  if (!/^WEBVTT(?:\s|$)/.test(normalized)) {
    throw new Error("La transcription ne contient pas un WebVTT valide");
  }

  return normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex(
      (line) => line.includes("-->")
    );

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

/** Rust si disponible, sinon JavaScript. */
export function parseVtt(vtt) {
  return parseVttNative(vtt) ?? parseVttJs(vtt);
}
