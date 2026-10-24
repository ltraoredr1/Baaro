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
import { supabase } from "../../../supabaseClient.js";
import { API_BASE } from "../../../config.js";
import { callSocial } from "../../../lib/notifyInteraction.js";

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

function randomCode(n) {
  var len = n || 6;
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var out = "";
  for (var i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function apiUrl(path) {
  var base = (API_BASE || "").replace(/\/$/, "");
  var p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

// Insère la salle ; réessaie si le code d'invitation existe déjà
// ou si la colonne max_participants n'existe pas dans la table.
async function insertRoomWithRetry(base) {
  var withMax = true;
  for (var attempt = 0; attempt < 5; attempt++) {
    var payload = Object.assign({}, base, { invite_code: randomCode(6) });
    if (withMax) payload.max_participants = 12;

    var res = await supabase
      .from("debate_rooms")
      .insert(payload)
      .select("*")
      .single();

    if (!res.error) return res.data;

    var err = res.error;
    var msg = err.message || "";

    if (err.code === "23505") continue; // code déjà pris -> nouveau code

    if (
      withMax &&
      (err.code === "PGRST204" ||
        err.code === "42703" ||
        /max_participants/i.test(msg))
    ) {
      withMax = false;
      continue;
    }

    throw err;
  }
  throw new Error("Impossible de générer un code d'invitation unique.");
}

function friendlyError(err) {
  var raw = (err && err.message) || String(err);
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)) {
    return "Connexion impossible. Vérifie ta connexion internet et réessaie.";
  }
  if (/row-level security|permission|policy|RLS/i.test(raw)) {
    return "Permission refusée par la base (RLS). Reconnecte-toi puis réessaie. Détail : " + raw;
  }
  return raw || "Impossible de créer la salle.";
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
    if (!titleVal || !topicVal) {
      setError("Titre et thème requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      var sessionRes = await supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      var user_id = session && session.user && session.user.id;
      if (!user_id) {
        throw new Error(
          "Tu dois être connecté pour créer un live. Reconnecte-toi."
        );
      }

      var finalMode = mode === "hybrid" ? "video" : mode;
      var finalTopic =
        mode === "hybrid" ? topicVal + " - Tout-en-un" : topicVal;

      var room = await insertRoomWithRetry({
        title: titleVal,
        topic: finalTopic,
        mode: finalMode,
        host_id: user_id,
        status: "active",
      });

      // Participant hôte (non bloquant)
      try {
        var partRes = await supabase.from("debate_participants").insert({
          room_id: room.id,
          user_id: user_id,
          role: "host",
        });
        if (partRes.error) {
          console.warn("participant warn:", partRes.error.message);
        }
      } catch (pErr) {
        console.warn("participant warn:", pErr && pErr.message);
      }

      // Salle Daily pour audio/vidéo (non bloquant, timeout 8 s)
      if (finalMode !== "text") {
        // Vrai nom de l'hôte (avant : « Hote » en dur pour tout le monde)
        var hostName = "Hôte";
        try {
          var profRes = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", user_id)
            .maybeSingle();
          if (profRes.data && profRes.data.display_name) {
            hostName = profRes.data.display_name;
          }
        } catch (nameErr) {
          console.warn("Nom de l'hôte indisponible:", nameErr && nameErr.message);
        }
        var controller =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = setTimeout(function () {
          if (controller) controller.abort();
        }, 8000);
        try {
          var res = await fetch(apiUrl("/api/create-room"), {
            method: "POST",
            signal: controller ? controller.signal : undefined,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.access_token,
            },
            body: JSON.stringify({
              action: "create-room",
              userName: hostName,
              title: titleVal,
              topic: finalTopic,
              mode: finalMode,
              inviteCode: room.invite_code,
            }),
          });
          var dailyData = await res.json().catch(function () {
            return {};
          });
          var name = dailyData.roomName || dailyData.daily_room_name;
          if (name) {
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
            "Daily API non dispo, salle chat créée quand même:",
            dailyErr && dailyErr.message
          );
        } finally {
          clearTimeout(timer);
        }
      }

      setTitle("");
      setTopic("");
      setMode("hybrid");
      setLoading(false);

      // Le serveur détermine lui-même les amis et abonnés destinataires,
      // puis crée la notification interne et envoie le push avec sonnerie.
      // Une panne push ne doit jamais annuler la création de la salle.
      callSocial("debate_started", { room_id: room.id }).catch(function (notifyErr) {
        console.warn("Notification débat/live non envoyée:", notifyErr?.message || notifyErr);
      });

      if (onSuccess) onSuccess(room);
      return;
    } catch (err) {
      console.error("Création débat:", err);
      setError(friendlyError(err));
    }
    setLoading(false);
  }

  var canSubmit = title.trim() && topic.trim() && !loading;

  var modal = (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
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