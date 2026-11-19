import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mic,
  Video,
  MessageSquare,
  Sparkles,
  Zap,
  Paperclip,
  Layers,
} from "lucide-react";
import { COLORS } from "../../../theme.js";

// Couleurs avec valeurs de secours : évite un bouton invisible si une clé manque dans theme.js
const C = {
  bg: (COLORS && COLORS.bg) || "#0f172a",
  surface: (COLORS && COLORS.surface) || "#111c33",
  surface2: (COLORS && COLORS.surface2) || "#1a2740",
  border: (COLORS && COLORS.border) || "rgba(148,163,184,0.2)",
  borderGold: (COLORS && COLORS.borderGold) || "rgba(217,174,82,0.4)",
  ivory: (COLORS && COLORS.ivory) || "#f8f5ec",
  muted: (COLORS && COLORS.muted) || "#94a3b8",
  gold: (COLORS && COLORS.gold) || "#d9ae52",
  teal: (COLORS && COLORS.teal) || "#2dbfa6",
};

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
    id: "hybrid",
    icon: Layers,
    label: "Tout",
    hint: "Texte - Voix - Vidéo - Fichiers",
  },
  { id: "video", icon: Video, label: "Vidéo", hint: "Caméra + chat" },
  { id: "audio", icon: Mic, label: "Audio", hint: "Voix + chat" },
  { id: "text", icon: MessageSquare, label: "Texte", hint: "Chat + fichiers" },
];

export function CreateDebateModal(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var onSuccess = props.onSuccess;
  var createRoom = props.createRoom;

  var titleState = useState("");
  var title = titleState[0];
  var setTitle = titleState[1];

  var topicState = useState("");
  var topic = topicState[0];
  var setTopic = topicState[1];

  var modeState = useState("hybrid");
  var mode = modeState[0];
  var setMode = modeState[1];

  var loadingState = useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var errorState = useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  function close() {
    if (loading) return;
    if (onClose) onClose();
  }

  async function handleCreate(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;
    var titleVal = title.trim();
    var topicVal = topic.trim();
    if (!titleVal || !topicVal) { setError("Titre et thème requis."); return; }
    if (typeof createRoom !== "function") { setError("Service de création indisponible."); return; }
    setLoading(true);
    setError(null);
    try {
      var result = await createRoom({ title: titleVal, topic: topicVal, mode: mode, maxParticipants: 12 });
      if (!result?.ok || !result.room) throw new Error(result?.reason || "Impossible de créer le débat.");
      setTitle(""); setTopic(""); setMode("hybrid");
      if (onSuccess) onSuccess(result.room);
    } catch (err) {
      console.error("Création débat:", err);
      setError(err?.message || "Impossible de créer le débat.");
    } finally { setLoading(false); }
  }

  var canSubmit = title.trim() && topic.trim() && !loading;

  var modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      style={{ zIndex: 9999 }}
      onClick={close}
    >
      <div
        onClick={function (ev) {
          ev.stopPropagation();
        }}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[92vh]"
        style={{
          background: C.surface,
          borderColor: C.borderGold,
          maxHeight: "92dvh",
        }}
      >
        {/* En-tête fixe */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ color: C.ivory }}
          >
            <Zap size={20} style={{ color: C.gold }} /> Nouveau live
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-full"
            style={{ color: C.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenu défilant */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-5 min-h-0">
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block"
              style={{ color: C.muted }}
            >
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={function (ev) {
                setTitle(ev.target.value);
              }}
              placeholder="Ex : Avenir de l'IA en Afrique"
              maxLength={80}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
          </div>

          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block"
              style={{ color: C.muted }}
            >
              Thème
            </label>
            <input
              type="text"
              value={topic}
              onChange={function (ev) {
                setTopic(ev.target.value);
              }}
              placeholder="Ex : Tech"
              maxLength={40}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-2"
              style={{
                background: C.surface2,
                borderColor: C.border,
                color: C.ivory,
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_SUGGESTIONS.map(function (t) {
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () {
                      setTopic(t);
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-full border font-medium"
                    style={{
                      background: topic === t ? C.teal + "22" : C.surface2,
                      borderColor: topic === t ? C.teal : C.border,
                      color: topic === t ? C.teal : C.muted,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-wider mb-2 block"
              style={{ color: C.muted }}
            >
              Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(function (m) {
                var Icon = m.icon;
                var active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={function () {
                      setMode(m.id);
                    }}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border"
                    style={{
                      background: active ? C.gold + "18" : C.surface2,
                      borderColor: active ? C.gold : C.border,
                      color: active ? C.gold : C.muted,
                    }}
                  >
                    <Icon size={20} />
                    <span className="text-xs font-bold">{m.label}</span>
                    <span className="text-[9px] opacity-70 text-center">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p
              className="text-[10px] mt-2 flex items-center gap-1"
              style={{ color: C.muted }}
            >
              <Paperclip size={12} /> Fichiers disponibles dans tous les
              formats
            </p>
          </div>
        </div>

        {/* Pied fixe : erreur + bouton toujours visibles */}
        <div
          className="px-6 pt-3 shrink-0 flex flex-col gap-3 border-t"
          style={{
            borderColor: C.border,
            paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {error ? (
            <div className="p-3 rounded-xl text-xs border border-red-500/40 bg-red-500/10 text-red-300 break-words">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]"
            style={{ background: C.gold, color: C.bg }}
          >
            {loading ? (
              <span className="animate-pulse">Création...</span>
            ) : (
              <>
                <Sparkles size={16} /> Lancer le live
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default CreateDebateModal;