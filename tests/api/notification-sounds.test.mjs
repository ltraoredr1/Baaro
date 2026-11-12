import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  BAARO_SOUNDS,
  ANDROID_CHANNEL_PREFIX as CLIENT_PREFIX,
  ANDROID_SILENT_CHANNEL_ID as CLIENT_SILENT,
  androidChannelForPrefs,
  allAndroidChannels,
  isSilent,
  normalizeSoundId as clientNormalize,
  normalizeSoundPrefs,
  toServerSoundPrefs,
} from "../../src/lib/notificationSounds.js";
import {
  SOUND_IDS,
  ANDROID_CHANNEL_PREFIX as SERVER_PREFIX,
  ANDROID_SILENT_CHANNEL_ID as SERVER_SILENT,
  LEGACY_ANDROID_CHANNEL_ID,
  applyWebSound,
  fcmSoundFields,
  normalizeSoundId,
  readSoundPreference,
} from "../../api/_lib/push-sounds.js";

const root = resolve(import.meta.dirname, "../..");

test("catalogues client et serveur identiques", () => {
  assert.deepEqual([...SOUND_IDS].sort(), Object.keys(BAARO_SOUNDS).sort());
  assert.equal(CLIENT_PREFIX, SERVER_PREFIX);
  assert.equal(CLIENT_SILENT, SERVER_SILENT);
});

test("chaque son a ses fichiers Web et Android", () => {
  for (const id of SOUND_IDS) {
    assert.ok(existsSync(resolve(root, `public/sounds/${id}.mp3`)), `mp3 ${id}`);
    assert.ok(
      existsSync(resolve(root, `android/app/src/main/res/raw/${id}.wav`)),
      `raw ${id}`
    );
  }
});

test("normalizeSoundId accepte id, fichier et chemin du catalogue seulement", () => {
  for (const fn of [normalizeSoundId, clientNormalize]) {
    assert.equal(fn("sahel_beat"), "sahel_beat");
    assert.equal(fn("sahel_beat.mp3"), "sahel_beat");
    assert.equal(fn("/sounds/sahel_beat.mp3"), "sahel_beat");
    assert.equal(fn("sounds/sahel_beat.wav"), "sahel_beat");
    assert.equal(fn("https://evil.example/x.mp3"), null);
    assert.equal(fn("/sounds/../secret.mp3"), null);
    assert.equal(fn("inconnu"), null);
    assert.equal(fn(null), null);
    assert.equal(fn(42), null);
  }
});

test("sans préférence synchronisée : comportement historique", () => {
  for (const row of [null, undefined, {}, { sound_id: null }, { sound_id: "x" }]) {
    const pref = readSoundPreference(row);
    assert.equal(pref.synced, false);

    const payload = { title: "t", sound: "baaro_pulse.mp3", data: { a: 1 } };
    assert.equal(applyWebSound(payload, pref), payload);

    const fcm = fcmSoundFields(pref);
    assert.equal(fcm.androidChannelId, LEGACY_ANDROID_CHANNEL_ID);
    assert.equal(fcm.androidSound, "baaro_pulse");
    assert.equal(fcm.apnsSound, "baaro_pulse.wav");
  }
});

test("Web : le son choisi remplace celui de l'appelant, sans muter l'original", () => {
  const pref = readSoundPreference({ sound_id: "nko_glow", sound_silent: false });
  const payload = { title: "t", sound: "/sounds/baaro_pulse.mp3", data: { x: 1 } };
  const out = applyWebSound(payload, pref);

  assert.equal(out.sound, "/sounds/nko_glow.mp3");
  assert.equal(out.data.sound, "/sounds/nko_glow.mp3");
  assert.equal(out.data.x, 1);
  assert.equal(out.silent, undefined);
  assert.equal(payload.sound, "/sounds/baaro_pulse.mp3");
  assert.equal(payload.data.sound, undefined);
});

test("Web : mode silencieux → sound none + silent", () => {
  const pref = readSoundPreference({ sound_id: "nko_glow", sound_silent: true });
  const out = applyWebSound({ title: "t", data: {} }, pref);

  assert.equal(out.sound, "none");
  assert.equal(out.silent, true);
  assert.equal(out.data.sound, "none");
});

test("FCM : canal Android propre au son choisi, canal muet en silencieux", () => {
  const normal = fcmSoundFields(
    readSoundPreference({ sound_id: "live_drop", sound_silent: false })
  );
  assert.equal(normal.androidChannelId, `${SERVER_PREFIX}live_drop`);
  assert.equal(normal.androidSound, "live_drop");
  assert.equal(normal.apnsSound, "live_drop.wav");

  const silent = fcmSoundFields(
    readSoundPreference({ sound_id: "live_drop", sound_silent: true })
  );
  assert.equal(silent.androidChannelId, SERVER_SILENT);
  assert.equal(silent.androidSound, undefined);
  assert.equal(silent.apnsSound, undefined);
});

test("le canal visé par le serveur est celui que l'app crée", () => {
  const created = new Set(allAndroidChannels().map((c) => c.id));

  for (const id of SOUND_IDS) {
    for (const silent of [false, true]) {
      const prefs = { enabled: !silent, muted: false, volume: 70, soundId: id };
      const clientChannel = androidChannelForPrefs(prefs);
      const server = toServerSoundPrefs(prefs);
      const serverChannel = fcmSoundFields(
        readSoundPreference(server)
      ).androidChannelId;

      assert.equal(serverChannel, clientChannel);
      assert.ok(created.has(serverChannel), serverChannel);
    }
  }
});

test("préférences client : valeurs invalides ramenées au défaut", () => {
  const prefs = normalizeSoundPrefs({ soundId: "/etc/passwd", volume: "fort" });
  assert.equal(prefs.soundId, "baaro_pulse");
  assert.equal(prefs.volume, 70);
  assert.equal(isSilent({ enabled: false, muted: false }), true);
  assert.equal(isSilent({ enabled: true, muted: true }), true);
  assert.equal(isSilent({ enabled: true, muted: false }), false);
  assert.deepEqual(
    toServerSoundPrefs({ enabled: true, muted: true, volume: 10, soundId: "creator_rise" }),
    { sound_id: "creator_rise", sound_silent: true }
  );
});
