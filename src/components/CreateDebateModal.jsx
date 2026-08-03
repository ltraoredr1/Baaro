import { useState } from "react";
import { X, Hash, Mic, Video, MessageSquare, Sparkles } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

export function CreateDebateModal({ isOpen, onClose, currentUserId, onSuccess }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const generateInviteCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const handleCreate = async () => {
    if (!title.trim() || !topic.trim() || !currentUserId) return;
    setLoading(true);
    setError(null);

    try {
      let room = null;

      // ========== MODE AUDIO / VIDÉO ==========
      if (mode === "audio" || mode === "video") {
        const res = await fetch(`${API_BASE}/api/create-room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-room",
            userName: "Hôte",
            hostId: currentUserId,
            enableHLS: false,
          }),
        });

        const dailyData = await res.json();
        if (!res.ok) {
          throw new Error(dailyData.error || "Impossible de créer la salle audio");
        }

        const inviteCode = dailyData.inviteCode;
        const dailyRoomName = dailyData.roomName;

        const { data: updatedRoom, error: updateError } = await supabase
          .from("debate_rooms")
          .update({
            title: title.trim(),
            topic: topic.trim(),
            mode: mode,
            daily_room_name: dailyRoomName,
            max_participants: 10,
          })
          .eq("invite_code", inviteCode)
          .select()
          .single();

        if (updateError) throw updateError;
        room = updatedRoom;

        await supabase.from("debate_participants").upsert({
          room_id: room.id,
          user_id: currentUserId,
        });
      }

      // ========== MODE TEXTE ==========
      else {
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

      onSuccess(room);
      onClose();
      setTitle("");
      setTopic("");
      setMode("text");
    } catch (err) {
      console.error("Erreur création débat:", err);
      setError(err.message || "Impossible de créer le débat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-card rounded-3xl p-6 border shadow-2xl flex flex-col gap-5"
        style={{ borderColor: COLORS.borderGold }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
            <Sparkles size={20} style={{ color: COLORS.gold }} />
            Nouveau Débat
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/20 border border-red-500 text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: COLORS.muted }}>
              Titre du débat
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: L'avenir de l'IA en Afrique"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: COLORS.muted }}>
              Sujet / Thème
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: #GreenTech, #Web3"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: COLORS.muted }}>
              Format
            </label>
            <div className="flex gap-2">
              {[
                { id: "text", icon: MessageSquare, label: "Texte" },
                { id: "audio", icon: Mic, label: "Audio" },
                { id: "video", icon: Video, label: "Vidéo" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all"
                  style={{
                    background: mode === m.id ? `${COLORS.gold}20` : COLORS.surface,
                    borderColor: mode === m.id ? COLORS.gold : COLORS.border,
                    color: mode === m.id ? COLORS.gold : COLORS.muted,
                  }}
                >
                  <m.icon size={18} />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !title.trim() || !topic.trim()}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          {loading ? (
            <span className="animate-pulse">Création en cours...</span>
          ) : (
            <>
              <Hash size={16} />
              Lancer le débat
            </>
          )}
        </button>
      </div>
    </div>
  );
}
