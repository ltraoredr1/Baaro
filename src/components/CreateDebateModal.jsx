import { useState } from "react";
import { X, Mic, Video, MessageSquare, Sparkles, Zap, Paperclip, Layers } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

const TOPIC_SUGGESTIONS = ["Tech & IA", "Afrique", "Économie", "Culture", "Sport", "Société"];
const MODES = [
  { id: "hybrid", icon: Layers, label: "Tout", hint: "Texte · Voix · Vidéo · Fichiers" },
  { id: "video", icon: Video, label: "Vidéo", hint: "Caméra + chat" },
  { id: "audio", icon: Mic, label: "Audio", hint: "Voix + chat" },
  { id: "text", icon: MessageSquare, label: "Texte", hint: "Chat + fichiers" },
];

function randomCode(n = 6) {
  return Math.random().toString(36).substring(2, 2 + n).toUpperCase();
}

export function CreateDebateModal({ isOpen, onClose, onSuccess }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const titleVal = title.trim();
    const topicVal = topic.trim();
    if (!titleVal || !topicVal) {
      setError("Titre et thème requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        throw new Error("Tu dois être connecté pour créer un live. Reconnecte-toi.");
      }

      const finalMode = mode === "hybrid" ? "video" : mode;
      const inviteCode = randomCode(6).toLowerCase();
      const finalTopic =
        mode === "hybrid" ? `${topicVal} · ⚡ Tout-en-un` : topicVal;

      // 1. Création directe en base (ne dépend pas de /api)
      const { data: room, error: roomErr } = await supabase
        .from("debate_rooms")
        .insert({
          title: titleVal,
          topic: finalTopic,
          mode: finalMode,
          invite_code: inviteCode,
          host_id: userId,
          status: "active",
          max_participants: 12,
        })
        .select("*")
        .single();

      if (roomErr) {
        const msg = roomErr.message || "";
        if (/fetch|network|Failed to fetch/i.test(msg)) {
          throw new Error(
            "Connexion impossible au serveur. Vérifie ton réseau ou réessaie."
          );
        }
        if (/permission|policy|RLS/i.test(msg)) {
          throw new Error("Permission refusée. Reconnecte-toi puis réessaie.");
        }
        throw new Error(msg || "Impossible de créer la salle.");
      }

      // 2. Participant host
      const { error: partErr } = await supabase
        .from("debate_participants")
        .insert({ room_id: room.id, user_id: userId, role: "host" });
      if (partErr) console.warn("participant warn:", partErr.message);

      // 3. Room Daily (optionnel — ne bloque pas si échec)
      if (finalMode !== "text" && API_BASE) {
        try {
          const res = await fetch(`${API_BASE}/api/create-room`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: "create-room",
              userName: "Hôte",
              title: titleVal,
              topic: finalTopic,
              mode: finalMode,
              inviteCode,
            }),
          });
          const dailyData = await res.json().catch(() => ({}));
          if (dailyData?.roomName || dailyData?.daily_room_name) {
            const name = dailyData.roomName || dailyData.daily_room_name;
            await supabase
              .from("debate_rooms")
              .update({ daily_room_name: name })
              .eq("id", room.id);
            room.daily_room_name = name;
          }
        } catch (dailyErr) {
          console.warn(
            "Daily API non dispo, salle chat créée quand même:",
            dailyErr?.message
          );
        }
      }

      onSuccess?.(room);
      onClose?.();
      setTitle("");
      setTopic("");
      setMode("hybrid");
    } catch (err) {
      console.error(err);
      const raw = err?.message || String(err);
      if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
        setError(
          "Connexion impossible. Vérifie ta connexion internet et réessaie."
        );
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = title.trim() && topic.trim() && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 border shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ color: COLORS.ivory }}
          >
            <Zap size={20} style={{ color: COLORS.gold }} /> Nouveau live
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs border border-red-500/40 bg-red-500/10 text-red-300">
            {error}
          </div>
        )}

        <div>
          <label
            className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block"
            style={{ color: COLORS.muted }}
          >
            Titre
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : L'avenir de l'IA en Afrique"
            maxLength={80}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
        </div>

        <div>
          <label
            className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block"
            style={{ color: COLORS.muted }}
          >
            Thème
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex : #Tech"
            maxLength={40}
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-2"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className="text-[10px] px-2.5 py-1 rounded-full border font-medium"
                style={{
                  background: topic === t ? `${COLORS.teal}22` : COLORS.surface2,
                  borderColor: topic === t ? COLORS.teal : COLORS.border,
                  color: topic === t ? COLORS.teal : COLORS.muted,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            className="text-[11px] font-bold uppercase tracking-wider mb-2 block"
            style={{ color: COLORS.muted }}
          >
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border"
                  style={{
                    background: active ? `${COLORS.gold}18` : COLORS.surface2,
                    borderColor: active ? COLORS.gold : COLORS.border,
                    color: active ? COLORS.gold : COLORS.muted,
                  }}
                >
                  <Icon size={20} />
                  <span className="text-xs font-bold">{m.label}</span>
                  <span className="text-[9px] opacity-70 text-center">{m.hint}</span>
                </button>
              );
            })}
          </div>
          <p
            className="text-[10px] mt-2 flex items-center gap-1"
            style={{ color: COLORS.muted }}
          >
            <Paperclip size={12} /> Fichiers disponibles dans tous les formats
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          {loading ? (
            <span className="animate-pulse">Création…</span>
          ) : (
            <>
              <Sparkles size={16} /> Lancer le live
            </>
          )}
        </button>
      </div>
    </div>
  );
}
