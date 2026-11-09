// Vérifie que le binaire Rust se comporte comme l'implémentation JS de référence.
// Usage : BAARO_MEDIA_BIN=rust/baaro-media/target/release/baaro-media node test/rust-parity.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVttJs } from "../lib/vtt.mjs";
import { parseVttNative, sniffFile } from "../lib/native.mjs";

let checks = 0;

function sameAsJs(input, label) {
  let expected;
  let jsFailed = false;
  try {
    expected = parseVttJs(input);
  } catch {
    jsFailed = true;
  }

  const actual = parseVttNative(input);

  if (jsFailed) {
    assert.equal(actual, null, `${label} : le JS refuse, Rust doit refuser`);
  } else {
    assert.notEqual(actual, null, `${label} : Rust a échoué alors que le JS accepte`);
    assert.deepEqual(actual, expected, `${label} : résultat différent`);
  }
  checks++;
}

// --- Cas ciblés -------------------------------------------------------------
const fixtures = {
  simple: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour\n",
  bom_crlf: "﻿WEBVTT\r\n\r\n1\r\n00:00:00.000 --> 00:00:01.000\r\nA\r\nB\r\n",
  titre: "WEBVTT - un titre\n\nNOTE commentaire\n\n00:00:01.000 --> 00:00:02.000\nx",
  entete_seul: "WEBVTT",
  tab_apres_entete: "WEBVTT\tx\n\n00:00:00.000 --> 00:00:01.000\nx",
  blanc_avec_espace: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na\n \nb\n",
  plusieurs_vides: "WEBVTT\n\n\n\n00:00:00.000 --> 00:00:01.000\na\n\n\n\n\n00:00:01.000 --> 00:00:02.000\nb",
  echappements: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n"citation" \\ antislash\ttab\n',
  unicode: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nߒߞߏ — é — 😀 —  \n",
  espaces_autour: "  \n\nWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx\n\n  ",
  pas_vtt: "Bonjour",
  entete_colle: "WEBVTTX\n\n",
  vide: "",
};
for (const [name, input] of Object.entries(fixtures)) sameAsJs(input, name);

// --- Fuzz déterministe ------------------------------------------------------
let seed = 12345;
const rand = (n) => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % n;
};
const pieces = [
  "WEBVTT", "\n", "\n", "\n\n", "\r\n", " ", "\t", "-->", "00:00:01.000 --> 00:00:02.000",
  "texte", "NOTE x", "é", "😀", '"', "\\", "﻿", " ", "1",
];
for (let i = 0; i < 3000; i++) {
  let s = rand(4) === 0 ? "" : "WEBVTT";
  const n = rand(25);
  for (let k = 0; k < n; k++) s += pieces[rand(pieces.length)];
  sameAsJs(s, `fuzz#${i}`);
}

// --- sniff ------------------------------------------------------------------
const dir = await mkdtemp(join(tmpdir(), "baaro-sniff-"));
try {
  const cases = [
    ["a.mp4", Buffer.from("\0\0\0\x20ftypisom\0\0\0\0"), { kind: "mp4", media: true, danger: false }],
    ["b.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { kind: "jpg", media: true, danger: false }],
    ["c.mp4", Buffer.from("\x7fELF\x02\x01\x01"), { kind: "elf", media: false, danger: true }],
    ["d.mp4", Buffer.from("<html><script>alert(1)</script>"), { kind: "html", media: false, danger: true }],
    ["e.mp4", Buffer.from("PK\x03\x04rest"), { kind: "zip", media: false, danger: true }],
    ["f.bin", Buffer.from("rien de connu"), { kind: "unknown", media: false, danger: false }],
  ];
  for (const [name, bytes, want] of cases) {
    const path = join(dir, name);
    await writeFile(path, bytes);
    const got = await sniffFile(path);
    assert.ok(got, `sniff ${name} : pas de résultat`);
    assert.equal(got.kind, want.kind, `sniff ${name}`);
    assert.equal(got.media, want.media, `sniff ${name} media`);
    assert.equal(got.danger, want.danger, `sniff ${name} danger`);
    assert.equal(got.size, bytes.length, `sniff ${name} size`);
    checks++;
  }
  assert.equal(await sniffFile(join(dir, "inexistant")), null);
  checks++;
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(`OK : ${checks} vérifications (VTT JS/Rust identiques, sniff conforme)`);
