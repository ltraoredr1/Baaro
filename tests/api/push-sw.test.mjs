import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const code = readFileSync(
  resolve(import.meta.dirname, "../../public/push-sw.js"),
  "utf8",
);

/** Charge push-sw.js dans un faux contexte de service worker. */
function loadServiceWorker(windowClients) {
  const listeners = {};
  const shown = [];

  const self = {
    location: { origin: "https://baaro.example" },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    clients: {
      matchAll: async () => windowClients,
      openWindow: async () => {},
    },
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
      },
    },
  };

  vm.runInNewContext(code, { self, URL, console });

  return { listeners, shown };
}

function makeClient(visibilityState) {
  const messages = [];
  return {
    visibilityState,
    url: "https://baaro.example/",
    messages,
    postMessage: (message) => messages.push(message),
  };
}

async function receivePush({ clients, payload }) {
  const { listeners, shown } = loadServiceWorker(clients);
  let pending;

  listeners.push({
    data: { json: () => payload },
    waitUntil: (promise) => {
      pending = promise;
    },
  });

  await pending;
  return shown;
}

const basePayload = {
  title: "Awa",
  body: "a aimé ta vidéo",
  category: "social",
  sound: "/sounds/baaro_pulse.mp3",
  data: { sound: "/sounds/baaro_pulse.mp3" },
};

test("app visible : l'app joue le son, la notification système est muette", async () => {
  const visible = makeClient("visible");
  const shown = await receivePush({ clients: [visible], payload: basePayload });

  assert.equal(visible.messages.length, 1);
  assert.equal(visible.messages[0].type, "PLAY_SOUND");
  assert.equal(typeof visible.messages[0].sentAt, "number");
  assert.equal(shown[0].options.silent, true);
});

test("arrière-plan : son système, aucun message à la page", async () => {
  const hidden = makeClient("hidden");
  const shown = await receivePush({ clients: [hidden], payload: basePayload });

  assert.equal(hidden.messages.length, 0);
  assert.equal(shown[0].options.silent, false);
});

test("app fermée (aucune fenêtre) : son système", async () => {
  const shown = await receivePush({ clients: [], payload: basePayload });

  assert.equal(shown.length, 1);
  assert.equal(shown[0].options.silent, false);
});

test("mode silencieux BAARO : muet partout, même app visible", async () => {
  for (const payload of [
    { ...basePayload, sound: "none", silent: true, data: { sound: "none" } },
    { ...basePayload, sound: "none", data: { sound: "none" } },
    { ...basePayload, silent: true },
  ]) {
    const visible = makeClient("visible");
    const shown = await receivePush({ clients: [visible], payload });

    assert.equal(visible.messages.length, 0);
    assert.equal(shown[0].options.silent, true);
  }

  // Et app fermée : notification muette, pas de son système.
  const shown = await receivePush({
    clients: [],
    payload: { ...basePayload, sound: "none", silent: true },
  });
  assert.equal(shown[0].options.silent, true);
});

test("seule la fenêtre visible reçoit PLAY_SOUND", async () => {
  const visible = makeClient("visible");
  const hidden = makeClient("hidden");

  await receivePush({ clients: [hidden, visible], payload: basePayload });

  assert.equal(visible.messages.length, 1);
  assert.equal(hidden.messages.length, 0);
});

test("l'option non standard `sound` n'est jamais utilisée et aucun chemin n'est relayé", async () => {
  const visible = makeClient("visible");
  const shown = await receivePush({
    clients: [visible],
    payload: { ...basePayload, sound: "https://evil.example/x.mp3" },
  });

  assert.equal("sound" in shown[0].options, false);
  assert.equal("sound" in visible.messages[0], false);
});
