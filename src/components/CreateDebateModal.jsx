import { useState } from "react";
import { X, Hash, Mic, Video, MessageSquare, Sparkles, Zap } from "lucide-react";
import { COLORS } from "../theme.js";
import { randomCode } from "../lib/id.js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

const TOPIC_SUGGESTIONS = [
  "Tech & IA",
  "Afrique",
  "Économie",
  "Culture",
  "Sport",
  "Société",
];

const MODES = [
  {
    id: "text",
    icon: MessageSquare,
    label: "Texte",
    hint: "Chat en direct",
  },
  {
    id: "audio",
    icon: Mic,
    label: "Audio",
    hint: "Voix · Daily",
  },
  {
    id: "video",
    icon: Video,
    label: "Vidéo",
    hint: "Caméra · Daily",
  },
];

export function CreateDebateModal({ isOpen, onClose, currentUserId, onSuccess }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const generateInviteCode = () => randomCode(6);

  const handleCreate = async () => {
    if (!title.trim() || !topic.trim() || !currentUserId) return;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Session expirée. Rechargez la page.");
      }

      let room = null;

      if (mode === "audio" || mode === "video") {
        const res = await fetch(`${API_BASE}/api/create-room`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "create-room",
            userName: "Hôte",
            enableHLS: false,
            title: title.trim(),
            topic: topic.trim(),
            mode,
          }),
        });

        let dailyData;
        try {
          dailyData = await res.json();
        } catch {
          throw new Error(`Réponse serveur invalide (${res.status}).`);
        }

        if (!res.ok) {
          throw new Error(
            dailyData.error || `Création salle impossible (${res.status}).`
          );
        }

        const inviteCode = dailyData.inviteCode;
        const dailyRoomName = dailyData.roomName;

        let updatedRoom = null;
        const { data: upd, error: updateError } = await supabase
          .from("debate_rooms")
          .update({
            title: title.trim(),
            topic: topic.trim(),
            mode,
            max_participants: 10,
          })
          .eq("invite_code", inviteCode)
          .select()
          .maybeSingle();

        if (updateError) console.warn("Update room meta:", updateError);
        updatedRoom = upd;

        if (!updatedRoom && dailyData.roomId) {
          const { data: fetched } = await supabase
            .from("debate_rooms")
            .select("*")
            .eq("id", dailyData.roomId)
            .maybeSingle();
          updatedRoom = fetched;
        }

        if (!updatedRoom) {
          updatedRoom = {
            id: dailyData.roomId,
            invite_code: inviteCode,
            daily_room_name: dailyRoomName,
            title: title.trim(),
            topic: topic.trim(),
            mode,
            status: "active",
            host_id: currentUserId,
          };
        }
        room = updatedRoom;
      } else {
        const inviteCode = generateInviteCode();
        const { data: newRoom, error: roomError } = await supabase
          .from("debate_rooms")
          .insert({
            title: title.trim(),
            topic: topic.trim(),
            mode: "text",
            invite_code: inviteCode,
            host_id: currentUserId,
            status: "active",
            max_participants: 10,
          })
          .select()
          .single();

        if (roomError) throw roomError;
        room = newRoom;

        await supabase.from("debate_participants").upsert({
          room_id: room.id,
          user_id: currentUserId,
        });
      }

      onSuccess?.(room);
      onClose?.();
      setTitle("");
      setTopic("");
      setMode("text");
    } catch (err) {
      console.error("Création débat:", err);
      setError(err.message || "Impossible de créer le débat");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = title.trim().length > 0 && topic.trim().length > 0 && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 border shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.borderGold,
        }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ color: COLORS.ivory }}
          >
            <Zap size={20} style={{ color: COLORS.gold }} />
            Nouveau live
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition"
            style={{ color: COLORS.muted }}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs border border-red-500/40 bg-red-500/10 text-red-300">
            {error}
          </div>
        )}

        {/* Titre */}
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

        {/* Thème + suggestions */}
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
                className="text-[10px] px-2.5 py-1 rounded-full border font-medium transition"
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

        {/* Format */}
        <div>
          <label
            className="text-[11px] font-bold uppercase tracking-wider mb-2 block"
            style={{ color: COLORS.muted }}
          >
            Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl border transition"
                  style={{
                    background: active ? `${COLORS.gold}18` : COLORS.surface2,
                    borderColor: active ? COLORS.gold : COLORS.border,
                    color: active ? COLORS.gold : COLORS.muted,
                  }}
                >
                  <Icon size={20} />
                  <span className="text-xs font-bold">{m.label}</span>
                  <span className="text-[9px] opacity-70">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 active:scale-[0.98]"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          {loading ? (
            <span className="animate-pulse">Création…</span>
          ) : (
            <>
              <Sparkles size={16} />
              Lancer le live
            </>
          )}
        </button>

        <p className="text-[10px] text-center" style={{ color: COLORS.muted }}>
          Un code d&apos;invitation sera généré pour partager la salle
        </p>
      </div>
    </div>
  );
}
