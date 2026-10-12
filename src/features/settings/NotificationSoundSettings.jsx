import { Volume2, VolumeX, Bell, Play } from "lucide-react";
import { useNotificationSound, BAARO_SOUNDS } from "../../hooks/useNotificationSound.js";
import SwitchButton from "./SwitchButton.jsx";

export default function NotificationSoundSettings({ C }) {
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

  if (loading) {
    return (
      <div className="p-4 text-sm" style={{ color: C.muted }}>
        Chargement…
      </div>
    );
  }

  return (
    <div
      className="p-4 space-y-4 rounded-2xl border mb-4"
      style={{ background: C.surface2, borderColor: C.border }}
    >
      <h4 className="font-bold flex items-center gap-2" style={{ color: C.gold }}>
        <Bell size={18} /> Son des notifications
      </h4>

      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: C.ivory }}>
          Activer les sons
        </span>
        <SwitchButton checked={enabled} onChange={setEnabled} C={C} />
      </div>

      <div className="flex items-center justify-between">
        <span
          className="text-sm flex items-center gap-2"
          style={{ color: C.ivory }}
        >
          {muted ? (
            <VolumeX size={16} style={{ color: "#ef4444" }} />
          ) : (
            <Volume2 size={16} style={{ color: C.teal }} />
          )}
          Mode silencieux
        </span>
        <SwitchButton
          checked={muted}
          onChange={setMuted}
          C={C}
          onColor="#ef4444"
          disabled={!enabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: C.ivory }}>
            Volume
          </span>
          <span className="text-xs font-bold" style={{ color: C.gold }}>
            {volume}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          disabled={!enabled || muted}
          className="w-full accent-amber-500 disabled:opacity-40"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm" style={{ color: C.ivory }}>
          Son BAARO
        </span>
        <select
          value={soundId}
          onChange={(e) => setSoundId(e.target.value)}
          disabled={!enabled || muted}
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
        onClick={playTest}
        disabled={!enabled || muted}
        className="w-full py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: C.gold, color: "#000" }}
      >
        <Play size={14} /> Tester le son
      </button>
    </div>
  );
}
