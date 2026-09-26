// src/features/settings/NotificationSoundSettings.jsx
import { Volume2, VolumeX, Bell, Play } from "lucide-react";
// ⚠️ CORRECTION ICI : 3 niveaux de remontée (../../../) au lieu de 2
import { useNotificationSound } from "../../../hooks/useNotificationSound.js";

export default function NotificationSoundSettings({ C }) {
  const { enabled, muted, volume, loading, setEnabled, setMuted, setVolume, playTest } = 
    useNotificationSound();

  if (loading) {
    return <div className="p-4 text-sm" style={{ color: C.muted }}>Chargement…</div>;
  }

  return (
    <div className="p-4 space-y-4 rounded-2xl border mb-4" style={{ background: C.surface2, borderColor: C.border }}>
      <h4 className="font-bold flex items-center gap-2" style={{ color: C.gold }}>
        <Bell size={18} /> Son des notifications
      </h4>

      {/* Toggle principal */}
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: C.ivory }}>Activer les sons</span>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className="relative w-12 h-6 rounded-full transition-colors"
          style={{ background: enabled ? C.teal : C.border }}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
            style={{
              background: "#fff",
              transform: enabled ? "translateX(26px)" : "translateX(2px)",
            }}
          />
        </button>
      </div>

      {/* Mute */}
      <div className="flex items-center justify-between">
        <span className="text-sm flex items-center gap-2" style={{ color: C.ivory }}>
          {muted ? <VolumeX size={16} style={{ color: "#ef4444" }} /> : <Volume2 size={16} style={{ color: C.teal }} />}
          Mode silencieux
        </span>
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          disabled={!enabled}
          className="relative w-12 h-6 rounded-full transition-colors disabled:opacity-40"
          style={{ background: muted ? "#ef4444" : C.border }}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
            style={{
              background: "#fff",
              transform: muted ? "translateX(26px)" : "translateX(2px)",
            }}
          />
        </button>
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: C.ivory }}>Volume</span>
          <span className="text-xs font-bold" style={{ color: C.gold }}>{volume}%</span>
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

      {/* Test */}
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
