import { useState } from "react";
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
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

const TOPIC_SUGGESTIONS = [
  "Tech & IA",
  "Afrique",
  "Economie",
  "Culture",
  "Sport",
  "Societe",
];

const MODES = [
  {
    id: "hybrid",
    icon: Layers,
    label: "Tout",
    hint: "Texte - Voix - Video - Fichiers",
  },
  { id: "video", icon: Video, label: "Video", hint: "Camera + chat" },
  { id: "audio", icon: Mic, label: "Audio", hint: "Voix + chat" },
  { id: "text", icon: MessageSquare, label: "Texte", hint: "Chat + fichiers" },
];

function randomCode(n) {
  if (!n) n = 6;
  return Math.random()
    .toString(36)
    .substring(2, 2 + n)
    .toLowerCase();
}

function apiUrl(path) {
  var base = (API_BASE || "").replace(/\/$/, "");
  var p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

export function CreateDebateModal(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var onSuccess = props.onSuccess;

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

  async function handleCreate(e) {
    if (e && e.preventDefault) e.preventDefault();
    var titleVal = title.trim();
    var topicVal = topic.trim();
    if (!titleVal || !topicVal) {
      setError("Titre et theme requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      var sessionRes = await supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      var userId = session && session.user && session.user.id;
      if (!userId) {
        throw new Error(
          "Tu dois etre connecte pour creer un live. Reconnecte-toi."
        );
      }

      var finalMode = mode === "hybrid" ? "video" : mode;
      var inviteCode = randomCode(6);
      var finalTopic =
        mode === "hybrid" ? topicVal + " - Tout-en-un" : topicVal;

      var roomRes = await supabase
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

      var room = roomRes.data;
      var roomErr = roomRes.error;

      if (roomErr) {
        var msg = roomErr.message || "";
        if (/fetch|network|Failed to fetch/i.test(msg)) {
          throw new Error(
            "Connexion impossible au serveur. Verifie ton reseau ou reessaie."
          );
        }
        if (/permission|policy|RLS/i.test(msg)) {
          throw new Error(
            "Permission refusee. Reconnecte-toi puis reessaie."
          );
        }
        throw new Error(msg || "Impossible de creer la salle.");
      }

      var partRes = await supabase.from("debate_participants").insert({
        room_id: room.id,
        user_id: userId,
        role: "host",
      });
      if (partRes.error) {
        console.warn("participant warn:", partRes.error.message);
      }

      if (finalMode !== "text") {
        try {
          var res = await fetch(apiUrl("/api/create-room"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.access_token,
            },
            body: JSON.stringify({
              action: "create-room",
              userName: "Hote",
              title: titleVal,
              topic: finalTopic,
              mode: finalMode,
              inviteCode: inviteCode,
            }),
          });
          var dailyData = await res.json().catch(function () {
            return {};
          });
          if (dailyData.roomName || dailyData.daily_room_name) {
            var name = dailyData.roomName || dailyData.daily_room_name;
            await supabase
              .from("debate_rooms")
              .update({ daily_room_name: name })
              .eq("id", room.id);
            room.daily_room_name = name;
          } else if (!res.ok) {
            console.warn(
              "Daily create-room:",
              dailyData.error || res.statusText
            );
          }
        } catch (dailyErr) {
          console.warn(
            "Daily API non dispo, salle chat creee quand meme:",
            dailyErr && dailyErr.message
          );
        }
      }

      if (onSuccess) onSuccess(room);
      if (onClose) onClose();
      setTitle("");
      setTopic("");
      setMode("hybrid");
    } catch (err) {
      console.error(err);
      var raw = (err && err.message) || String(err);
      if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
        setError(
          "Connexion impossible. Verifie ta connexion internet et reessaie."
        );
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }

  var canSubmit = title.trim() && topic.trim() && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={function (ev) {
          ev.stopPropagation();
        }}
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
            type="button"
            onClick={onClose}
            className="p-2 rounded-full"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {error ? (
          <div className="p-3 rounded-xl text-xs border border-red-500/40 bg-red-500/10 text-red-300">
            {error}
          </div>
        ) : null}

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
            onChange={function (ev) {
              setTitle(ev.target.value);
            }}
            placeholder="Ex : Avenir de l IA en Afrique"
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
            Theme
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
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
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
                    background:
                      topic === t ? COLORS.teal + "22" : COLORS.surface2,
                    borderColor: topic === t ? COLORS.teal : COLORS.border,
                    color: topic === t ? COLORS.teal : COLORS.muted,
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
            style={{ color: COLORS.muted }}
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
                    background: active ? COLORS.gold + "18" : COLORS.surface2,
                    borderColor: active ? COLORS.gold : COLORS.border,
                    color: active ? COLORS.gold : COLORS.muted,
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
            <span className="animate-pulse">Creation...</span>
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

export default CreateDebateModal;
