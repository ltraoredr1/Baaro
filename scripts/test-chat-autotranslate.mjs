#!/usr/bin/env node
/**
 * Tests de la traduction directe du chat (détection de langue + file d'attente).
 * Lancer : node scripts/test-chat-autotranslate.mjs
 */
import assert from "node:assert/strict";
import { guessLang, needsTranslation } from "../src/features/messaging/lib/chatLangGuess.js";
import { createTranslateQueue } from "../src/features/messaging/lib/translateQueue.js";

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  ÉCHEC  ${name}\n        ${e.message}`);
    process.exitCode = 1;
  }
};

console.log("Détection de langue");
await test("français évident", () => {
  assert.equal(guessLang("Bonjour, comment ça va ?"), "fr");
  assert.equal(guessLang("Je suis au marché aujourd'hui"), "fr");
  assert.equal(guessLang("Merci beaucoup pour ton aide"), "fr");
});
await test("bambara avec lettres spéciales", () => {
  assert.equal(guessLang("I ni ce, i ka kɛnɛ wa?"), "bm");
  assert.equal(guessLang("N bɛ taa sugu la sini"), "bm");
  assert.equal(guessLang("A ye fɛn dɔ di n ma"), "bm");
});
await test("salutations bambara sans caractères spéciaux", () => {
  assert.equal(guessLang("I ni sogoma"), "bm");
  assert.equal(guessLang("I ni ce"), "bm");
});
await test("bambara familier sans accents (mots distinctifs)", () => {
  assert.equal(guessLang("n ye baara kosebe"), "bm");
});
await test("incertain → null (sera traduit, le serveur renverra tel quel si besoin)", () => {
  assert.equal(guessLang("Hello how are you"), null);
});
await test("neutre : ok, rires, chiffres", () => {
  assert.equal(guessLang("ok"), "neutral");
  assert.equal(guessLang("hahaha"), "neutral");
  assert.equal(guessLang("12345"), "neutral");
  assert.equal(guessLang("😂😂"), "neutral");
});
await test("« te » (pronom français) n'est pas pris pour du bambara", () => {
  assert.notEqual(guessLang("je te vois demain"), "bm");
});

console.log("needsTranslation");
await test("lecteur français : le français n'est pas envoyé, le bambara oui", () => {
  assert.equal(needsTranslation("Bonjour, comment ça va ?", "fr"), false);
  assert.equal(needsTranslation("I ni ce, i ka kɛnɛ wa?", "fr"), true);
});
await test("lecteur bambara (grand-père à Ségou) : le français est traduit, le bambara non", () => {
  assert.equal(needsTranslation("Bonjour, comment ça va ?", "bm"), true);
  assert.equal(needsTranslation("I ni ce, i ka kɛnɛ wa?", "bm"), false);
});
await test("liens, emojis et messages vides ne sont jamais envoyés", () => {
  assert.equal(needsTranslation("https://exemple.com/page", "fr"), false);
  assert.equal(needsTranslation("😂", "fr"), false);
  assert.equal(needsTranslation("", "bm"), false);
});

console.log("File d'attente");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await test("cache : la même demande n'appelle le service qu'une fois", async () => {
  let calls = 0;
  const q = createTranslateQueue({ translate: async (t) => (calls++, `T:${t}`) });
  const [a, b] = await Promise.all([q.enqueue("salut", "bm"), q.enqueue("salut", "bm")]);
  assert.equal(a, "T:salut");
  assert.equal(b, "T:salut");
  await q.enqueue("salut", "bm");
  assert.equal(calls, 1);
  assert.equal(q.peek("salut", "bm"), "T:salut");
});

await test("LIFO : le message le plus récent est traduit en premier", async () => {
  const order = [];
  const q = createTranslateQueue({
    concurrency: 1,
    translate: async (t) => {
      order.push(t);
      await wait(5);
      return t;
    },
  });
  const ps = ["m1", "m2", "m3"].map((m) => q.enqueue(m, "fr"));
  await Promise.all(ps);
  assert.deepEqual(order, ["m3", "m2", "m1"]);
});

await test("plafond par fenêtre : au plus N démarrages, le reste attend", async () => {
  let calls = 0;
  const q = createTranslateQueue({
    concurrency: 5,
    maxPerWindow: 3,
    windowMs: 80,
    translate: async (t) => (calls++, t),
  });
  const ps = Array.from({ length: 5 }, (_, i) => q.enqueue(`x${i}`, "fr"));
  await wait(30);
  assert.equal(calls, 3, "3 démarrés immédiatement");
  await Promise.all(ps);
  assert.equal(calls, 5, "les 2 autres partent après la fenêtre");
});

await test("429 : pause puis nouvel essai réussi", async () => {
  let n = 0;
  const q = createTranslateQueue({
    retryPauseMs: 40,
    translate: async (t) => {
      n += 1;
      if (n === 1) throw Object.assign(new Error("Trop de demandes"), { status: 429 });
      return `ok:${t}`;
    },
  });
  assert.equal(await q.enqueue("a", "fr"), "ok:a");
  assert.equal(n, 2);
});

await test("abandon avant démarrage : rien n'est envoyé", async () => {
  let calls = 0;
  const q = createTranslateQueue({
    concurrency: 1,
    translate: async (t) => {
      calls += 1;
      await wait(20);
      return t;
    },
  });
  const first = q.enqueue("long", "fr");
  const ctrl = new AbortController();
  const second = q.enqueue("annule", "fr", { signal: ctrl.signal });
  const secondResult = second.then(
    () => null,
    (e) => e
  );
  ctrl.abort();
  await first;
  const err = await secondResult;
  assert.equal(err?.name, "AbortError");
  assert.equal(calls, 1);
});

await test("deux demandeurs du même texte : l'abandon de l'un ne gêne pas l'autre", async () => {
  let calls = 0;
  const q = createTranslateQueue({
    translate: async (t) => {
      calls += 1;
      await wait(10);
      return `T:${t}`;
    },
  });
  const a = new AbortController();
  const first = q.enqueue("salut", "bm", { signal: a.signal }).then(
    () => null,
    (e) => e
  );
  a.abort(); // ex. composant démonté puis remonté (React StrictMode)
  const b = new AbortController();
  const second = q.enqueue("salut", "bm", { signal: b.signal });
  assert.equal((await first)?.name, "AbortError");
  assert.equal(await second, "T:salut");
  assert.equal(calls, 1);
});

await test("erreur autre que 429 : rejetée, et rien n'est mis en cache", async () => {
  let n = 0;
  const q = createTranslateQueue({
    translate: async () => {
      n += 1;
      throw Object.assign(new Error("boom"), { status: 502 });
    },
  });
  await assert.rejects(q.enqueue("a", "fr"), /boom/);
  assert.equal(q.peek("a", "fr"), undefined);
  await assert.rejects(q.enqueue("a", "fr"), /boom/);
  assert.equal(n, 2);
});

console.log(`\n${passed} test(s) réussi(s)${process.exitCode ? " — des échecs ci-dessus" : ""}`);
