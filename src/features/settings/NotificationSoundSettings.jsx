import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";
import { useNotificationSound, BAARO_SOUNDS } from "../../hooks/useNotificationSound.js";
import SwitchButton from "./SwitchButton.jsx";

/**
 * Corrections :
 * - Le titre « Son des notifications » doublonnait celui de la section : retiré.
 * - Le curseur de volume n'écrit plus à chaque pixel (stockage + cloud) :
 *   valeur affichée en direct, enregistrée 250 ms après le dernier mouvement
 *   (et à la fermeture du panneau).
 * - Interrupteurs accessibles (label), marge basse inutile retirée.
 * - Textes surchargeables via la prop `labels` (traduction), français par défaut.
 */
const DEFAULT_LABELS = {
  loading: "Chargement…",
  enable: "Activer les sons",
  mute: "Mode silencieux",
  volume: "Volume",
  sound: "Son BAARO",
  test: "Tester le son",
};

export default function NotificationSoundSettings({ C, labels }) {
  const tx = { ...DEFAULT_LABELS, ...(labels || {}) };

  const {
    enabled,
    muted,
    volume,
    soundId,
    loading,
    setEnabled,
    setMuted,
    setVolume,
    setSoundId,
    playTest,
  } = useNotificationSound();

  const [draftVolume, setDraftVolume] = useState(volume);
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const setVolumeRef = useRef(setVolume);
  setVolumeRef.current = setVolume;

  // Suit la valeur réelle (chargement, changement venant d'ailleurs).
  useEffect(() => {
    setDraftVolume(volume);
  }, [volume]);

  const flushVolume = () => {
    clearTimeout(timerRef.current);
    if (pendingRef.current !== null) {
      const value = pendingRef.current;
      pendingRef.current = null;
      setVolumeRef.current(value);
    }
  };

  // À la fermeture du panneau, enregistre une valeur encore en attente.
  useEffect(() => flushVolume, []);

  const onVolumeChange = (value) => {
    setDraftVolume(value);
    pendingRef.current = value;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushVolume, 250);
  };

  if (loading) {
    return (
      <div className="p-4 text-sm" style={{ color: C.muted }}>
        {tx.loading}
      </div>
    );
  }

  const soundsOff = !enabled || muted;

  return (
    <div
      className="p-4 space-y-4 rounded-2xl border"
      style={{ background: C.surface2, borderColor: C.border }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" style={{ color: C.ivory }}>
          {tx.enable}
        </span>
        <SwitchButton
          checked={enabled}
          onChange={setEnabled}
          C={C}
          label={tx.enable}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span
          className="text-sm flex items-center gap-2"
          style={{ color: C.ivory }}
        >
          {muted ? (
            <VolumeX size={16} style={{ color: "#ef4444" }} />
          ) : (
            <Volume2 size={16} style={{ color: C.teal }} />
          )}
          {tx.mute}
        </span>
        <SwitchButton
          checked={muted}
          onChange={setMuted}
          C={C}
          onColor="#ef4444"
          disabled={!enabled}
          label={tx.mute}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="baaro-notif-volume" className="text-sm" style={{ color: C.ivory }}>
            {tx.volume}
          </label>
          <span className="text-xs font-bold" style={{ color: C.gold }}>
            {draftVolume}%
          </span>
        </div>
        <input
          id="baaro-notif-volume"
          type="range"
          min="0"
          max="100"
          value={draftVolume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onPointerUp={flushVolume}
          onKeyUp={flushVolume}
          disabled={soundsOff}
          className="w-full accent-amber-500 disabled:opacity-40"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="baaro-notif-sound" className="text-sm" style={{ color: C.ivory }}>
          {tx.sound}
        </label>
        <select
          id="baaro-notif-sound"
          value={soundId}
          onChange={(e) => setSoundId(e.target.value)}
          disabled={soundsOff}
          className="w-full rounded-xl px-3 py-2 text-sm disabled:opacity-40"
          style={{
            background: C.surface || "#1a1a1a",
            color: C.ivory,
            border: `1px solid ${C.border}`,
          }}
        >
          {Object.values(BAARO_SOUNDS).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => {
          flushVolume();
          playTest();
        }}
        disabled={soundsOff}
        className="w-full py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: C.gold, color: "#000" }}
      >
        <Play size={14} /> {tx.test}
      </button>
    </div>
  );
}
