import test from "node:test";
import assert from "node:assert/strict";
import { planLruEvictions } from "../../src/lib/offlineCachePolicy.js";

const entry = (key, bytes, lastAccessedAt) => ({ key, bytes, lastAccessedAt });

test("ne fait aucune éviction lorsque le cache est sous le quota ou exactement à la limite", () => {
  const entries = [entry("a", 4, 1), entry("b", 6, 2)];

  assert.deepEqual(planLruEvictions(entries, 10), {
    keysToEvict: [],
    protectedKeyToEvict: null,
    resultingBytes: 10,
  });
  assert.deepEqual(planLruEvictions(entries, 11), {
    keysToEvict: [],
    protectedKeyToEvict: null,
    resultingBytes: 10,
  });
});

test("évince le moins récemment consulté et s’arrête dès que le quota est respecté", () => {
  const entries = [
    entry("oldest", 4, 10),
    entry("middle", 3, 20),
    entry("newest", 5, 30),
  ];

  assert.deepEqual(planLruEvictions(entries, 8), {
    keysToEvict: ["oldest"],
    protectedKeyToEvict: null,
    resultingBytes: 8,
  });
});

test("l’actualisation de lastAccessedAt préserve l’entrée consultée récemment", () => {
  const entries = [
    entry("opened-again", 4, 100),
    entry("stale", 4, 10),
    entry("recent", 4, 50),
  ];

  const plan = planLruEvictions(entries, 8);
  assert.deepEqual(plan.keysToEvict, ["stale"]);
  assert.equal(plan.resultingBytes, 8);
});

test("préserve l’entrée en cours et son parent, et évince les autres de la plus ancienne à la plus récente", () => {
  const entries = [
    entry("publication", 2, 50),
    entry("new-photo", 3, 60),
    entry("old-photo", 4, 1),
    entry("older-post", 2, 20),
    entry("recent-post", 2, 30),
  ];

  const plan = planLruEvictions(entries, 8, ["new-photo", "publication"]);
  assert.deepEqual(plan.keysToEvict, ["old-photo", "older-post"]);
  assert.equal(plan.protectedKeyToEvict, null);
  assert.equal(plan.resultingBytes, 7);
});

test("n’efface pas les anciennes entrées si le nouvel élément protégé ne peut pas tenir", () => {
  const entries = [entry("existing", 8, 1), entry("oversized-new", 12, 2)];

  assert.deepEqual(planLruEvictions(entries, 10, ["oversized-new"]), {
    keysToEvict: [],
    protectedKeyToEvict: "oversized-new",
    resultingBytes: 8,
  });
});

test("réduit un cache déjà rempli en retirant plusieurs entrées LRU jusqu’au nouveau quota", () => {
  const entries = [
    entry("a", 3, 1),
    entry("b", 3, 2),
    entry("c", 3, 3),
    entry("d", 3, 4),
  ];

  const plan = planLruEvictions(entries, 6);
  assert.deepEqual(plan.keysToEvict, ["a", "b"]);
  assert.equal(plan.resultingBytes, 6);
});

test("départage les mêmes dates d’accès de façon stable selon l’ordre des entrées", () => {
  const entries = [entry("first", 5, 10), entry("second", 5, 10), entry("third", 5, 20)];

  const plan = planLruEvictions(entries, 10);
  assert.deepEqual(plan.keysToEvict, ["first"]);
  assert.equal(plan.resultingBytes, 10);
});
