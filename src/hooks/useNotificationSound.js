import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "baaro:notification-sound";

function loadPrefs() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { enabled: true, muted: false, volume: 70 };
    }
    var parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      muted: !!parsed.muted,
      volume: typeof parsed.volume === "number" ? parsed.volume : 70,
    };
  } catch (_) {
    return { enabled: true, muted: false, volume: 70 };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

function playBeep(volumePercent) {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    var vol = Math.max(0, Math.min(1, (volumePercent || 70) / 100)) * 0.25;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(function () {
      try {
        osc.stop();
        ctx.close();
      } catch (_) {}
    }, 180);
  } catch (_) {}
}

export function useNotificationSound() {
  var initial = loadPrefs();
  var enabledState = useState(initial.enabled);
  var enabled = enabledState[0];
  var setEnabledState = enabledState[1];

  var mutedState = useState(initial.muted);
  var muted = mutedState[0];
  var setMutedState = mutedState[1];

  var volumeState = useState(initial.volume);
  var volume = volumeState[0];
  var setVolumeState = volumeState[1];

  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  useEffect(function () {
    setLoading(false);
  }, []);

  useEffect(
    function () {
      savePrefs({ enabled: enabled, muted: muted, volume: volume });
    },
    [enabled, muted, volume]
  );

  var setEnabled = useCallback(function (v) {
    setEnabledState(!!v);
  }, []);

  var setMuted = useCallback(function (v) {
    setMutedState(!!v);
  }, []);

  var setVolume = useCallback(function (v) {
    var n = Number(v);
    if (!Number.isFinite(n)) n = 70;
    setVolumeState(Math.max(0, Math.min(100, n)));
  }, []);

  var playTest = useCallback(
    function () {
      if (!enabled || muted) return;
      playBeep(volume);
    },
    [enabled, muted, volume]
  );

  var playNotification = useCallback(
    function () {
      if (!enabled || muted) return;
      playBeep(volume);
    },
    [enabled, muted, volume]
  );

  return {
    enabled: enabled,
    muted: muted,
    volume: volume,
    loading: loading,
    setEnabled: setEnabled,
    setMuted: setMuted,
    setVolume: setVolume,
    playTest: playTest,
    playNotification: playNotification,
  };
}

export default useNotificationSound;
