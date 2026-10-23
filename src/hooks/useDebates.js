import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";
import DailyIframe from "@daily-co/daily-js";

const canSend = (() => {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < 700) return false;
    last = now;
    return true;
  };
})();

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

// Suffixe unique : deux composants qui utilisent le même hook ne se marchent plus dessus
function uid() {
  return Math.random().toString(36).slice(2, 8);
}

// Code d'invitation : 6 caractères minuscules, sans caractères ambigus (0/o, 1/l/i)
function makeInviteCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  try {
    (globalThis.crypto || window.crypto).getRandomValues(bytes);
  } catch (_) {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Daily n'autorise qu'UNE seule instance à la fois dans toute la page.
 * leave() et destroy() sont dans des try/catch SÉPARÉS : leave() lève
 * une erreur si on n'est pas encore dans la room, et destroy() doit
 * quand même s'exécuter.
 */
async function destroyExistingCall() {
  var existing = null;
  try {
    existing = DailyIframe.getCallInstance ? DailyIframe.getCallInstance() : null;
  } catch (_) {}
  if (!existing) return;
  try {
    await existing.leave();
  } catch (_) {}
  try {
    await existing.destroy();
  } catch (_) {}
}

/**
 * Teste l'accès aux périphériques puis les libère aussitôt.
 * Retourne { ok, reason } avec reason :
 * "denied" | "missing" | "busy" | "unsupported" | "unknown" | null
 */
async function probeMedia(constraints) {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    var s = await navigator.mediaDevices.getUserMedia(constraints);
    s.getTracks().forEach(function (t) {
      t.stop();
    });
    return { ok: true, reason: null };
  } catch (e) {
    var n = (e && e.name) || "";
    if (
      n === "NotAllowedError" ||
      n === "PermissionDeniedError" ||
      n === "SecurityError"
    ) {
      return { ok: false, reason: "denied" };
    }
    if (
      n === "NotFoundError" ||
      n === "DevicesNotFoundError" ||
      n === "OverconstrainedError"
    ) {
      return { ok: false, reason: "missing" };
    }
    if (n === "NotReadableError" || n === "TrackStartError" || n === "AbortError") {
      return { ok: false, reason: "busy" };
    }
    return { ok: false, reason: "unknown" };
  }
}

/**
 * Vérifie caméra et micro séparément pour savoir précisément quoi couper.
 * Un seul essai combiné d'abord (une seule demande d'autorisation dans le cas normal).
 */
async function checkDevices(wantVideo) {
  var micReason = null;
  var camReason = null;

  if (wantVideo) {
    var both = await probeMedia({ video: true, audio: true });
    if (both.reason === "unsupported") {
      return { micReason: "unsupported", camReason: "unsupported" };
    }
    if (!both.ok) {
      var a = await probeMedia({ audio: true });
      var v = await probeMedia({ video: true });
      micReason = a.ok ? null : a.reason;
      camReason = v.ok ? null : v.reason;
    }
  } else {
    var a2 = await probeMedia({ audio: true });
    micReason = a2.ok ? null : a2.reason;
  }
  return { micReason: micReason, camReason: camReason };
}

function cameraMessage(reason) {
  switch (reason) {
    case "denied":
      return "Caméra refusée : tu rejoins en audio seul avec ton micro. Autorise la caméra dans les réglages du site pour l'activer ensuite.";
    case "missing":
      return "Aucune caméra détectée : tu rejoins en audio seul avec ton micro.";
    case "busy":
      return "Caméra utilisée par une autre application : tu rejoins en audio seul avec ton micro.";
    default:
      return "Caméra indisponible : tu rejoins en audio seul avec ton micro.";
  }
}

function micMessage(reason, withCamera) {
  var tail = withCamera
    ? "tu rejoins avec la caméra, sans micro."
    : "tu rejoins en écoute seule.";
  switch (reason) {
    case "denied":
      return (
        "Micro refusé : " +
        tail +
        " Autorise le micro dans les réglages du site pour participer."
      );
    case "missing":
      return "Aucun micro détecté : " + tail;
    case "busy":
      return "Micro utilisé par une autre application : " + tail;
    default:
      return "Micro indisponible : " + tail;
  }
}

/** Construit le plan de connexion (quoi couper + message clair) */
function buildJoinPlan(wantVideo, devices) {
  var camReason = wantVideo ? devices.camReason : null;
  var micReason = devices.micReason;
  var videoOff = !wantVideo || !!camReason;
  var audioOff = !!micReason;
  var message = null;

  if (camReason && micReason) {
    message =
      "Caméra et micro indisponibles : tu rejoins en écoute seule. Autorise-les dans les réglages du site pour participer.";
  } else if (camReason) {
    message = cameraMessage(camReason);
  } else if (micReason) {
    message = micMessage(micReason, wantVideo);
  }
  return { videoOff: videoOff, audioOff: audioOff, message: message };
}

/** Message pour une erreur caméra levée par Daily (pendant ou après la connexion) */
function describeDailyCameraError(ev) {
  var type = (ev && ev.error && ev.error.type) || "";
  switch (type) {
    case "permissions":
      return "Caméra refusée : tu continues en audio seul. Autorise la caméra dans les réglages du site pour l'activer.";
    case "not-found":
      return "Aucune caméra détectée : tu continues en audio seul.";
    case "cam-in-use":
    case "cam-mic-in-use":
      return "Caméra utilisée par une autre application : tu continues en audio seul.";
    case "mic-in-use":
      return "Micro utilisé par une autre application : ferme-la pour parler.";
    default:
      return "Caméra indisponible : tu continues en audio seul.";
  }
}

function withTimeout(promise, ms, message) {
  var timer;
  // Évite une "unhandled rejection" si la promesse échoue après le timeout
  promise.catch(function () {});
  var timeout = new Promise(function (_, rej) {
    timer = setTimeout(function () {
      rej(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () {
    clearTimeout(timer);
  });
}

export function useDebates(user_id) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const instanceId = useRef(uid());

  const loadRooms = useCallback(async () => {
    if (!user_id) {
      setRooms([]);
      setLoadingRooms(false);
      return;
    }
    setLoadingRooms(true);
    try {
      const { data: parts } = await supabase
        .from("debate_participants")
        .select("room_id")
        .eq("user_id", user_id)
        .is("left_at", null);
      if (!parts?.length) {
        setRooms([]);
        return;
      }
      const ids = parts.map((p) => p.room_id);
      const { data: roomsData } = await supabase
        .from("debate_rooms")
        .select("*")
        .in("id", ids)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      setRooms(roomsData || []);
    } catch (err) {
      console.error(err);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [user_id]);

  useEffect(() => {
    loadRooms();
    if (!user_id) return;
    const ch = supabase
      .channel("debate-rooms:" + user_id + ":" + instanceId.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debate_participants",
          filter: "user_id=eq." + user_id,
        },
        loadRooms
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadRooms, user_id]);

  const createRoom = useCallback(
    async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
      if (!user_id) return { ok: false, reason: "Non authentifié" };
      let room = null;
      try {
        // Retry si le code d'invitation existe déjà (index unique)
        let lastErr = null;
        for (let attempt = 0; attempt < 3 && !room; attempt++) {
          const { data, error } = await supabase
            .from("debate_rooms")
            .insert({
              title: (title || "Débat").slice(0, 120),
              topic: (topic || "").slice(0, 300),
              mode: mode || "text",
              max_participants: Math.min(
                Math.max(maxParticipants || 8, 2),
                100
              ),
              ai_enabled: !!aiEnabled,
              host_id: user_id,
              invite_code: makeInviteCode(),
              status: "active",
            })
            .select()
            .single();
          if (!error) {
            room = data;
          } else if (error.code === "23505") {
            lastErr = error;
          } else {
            throw error;
          }
        }
        if (!room) throw lastErr || new Error("Création impossible");

        const { error: e2 } = await supabase.from("debate_participants").insert({
          room_id: room.id,
          user_id: user_id,
          role: "host",
        });
        if (e2) {
          // Évite une salle fantôme sans hôte participant
          try {
            await supabase
              .from("debate_rooms")
              .update({ status: "ended" })
              .eq("id", room.id)
              .eq("host_id", user_id);
          } catch (_) {}
          throw e2;
        }

        await loadRooms();
        return { ok: true, room };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },
    [user_id, loadRooms]
  );

  const joinByCode = useCallback(
    async (code) => {
      const c = (code || "").trim().toLowerCase();
      if (!c) return { ok: false, reason: "Code requis" };
      if (!user_id) return { ok: false, reason: "Non authentifié" };
      try {
        // La lecture directe de debate_rooms est privée (hôte ou membre) :
        // un nouveau venu doit passer par la RPC, qui vérifie aussi la capacité.
        const { data, error } = await supabase.rpc("join_debate_by_code", {
          p_code: c,
        });
        if (error) throw error;
        const room = Array.isArray(data) ? data[0] : data;
        if (!room) throw new Error("Code invalide");
        await loadRooms();
        return { ok: true, room };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },
    [user_id, loadRooms]
  );

  const leaveRoom = useCallback(
    async (roomId) => {
      await supabase
        .from("debate_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", user_id);
      setRooms((r) => r.filter((x) => x.id !== roomId));
    },
    [user_id]
  );

  const endRoom = useCallback(
    async (roomId) => {
      await supabase
        .from("debate_rooms")
        .update({ status: "ended" })
        .eq("id", roomId)
        .eq("host_id", user_id);
      setRooms((r) => r.filter((x) => x.id !== roomId));
    },
    [user_id]
  );

  return {
    rooms,
    loadingRooms,
    createRoom,
    joinByCode,
    leaveRoom,
    endRoom,
    loadRooms,
    refreshRooms: loadRooms,
  };
}

export function useRoomChat(roomId, user_id) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesRef = useRef([]);
  const instanceId = useRef(uid());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("debate_messages")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true })
          .limit(300);
        if (!cancelled) setMessages(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const ch = supabase
      .channel("debate-messages:" + roomId + ":" + instanceId.current)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "debate_messages",
          filter: "room_id=eq." + roomId,
        },
        (p) =>
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.new.id)) return prev;
            // Remplace le message optimiste correspondant (évite le doublon)
            const cleaned = prev.filter(
              (m) =>
                !(
                  String(m.id).startsWith("tmp_") &&
                  m.sender_id === p.new.sender_id &&
                  m.text === p.new.text
                )
            );
            return [...cleaned, p.new];
          })
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const sendText = useCallback(
    async (text) => {
      const content = (text ?? inputText).trim().slice(0, 1000);
      if (!content || !roomId || !user_id || !canSend()) return;
      setInputText("");
      const tmpId = "tmp_" + Date.now();
      setMessages((p) => [
        ...p,
        {
          id: tmpId,
          room_id: roomId,
          sender_id: user_id,
          sender_type: "user",
          text: content,
          created_at: new Date().toISOString(),
        },
      ]);
      const { data, error } = await supabase
        .from("debate_messages")
        .insert({
          room_id: roomId,
          sender_id: user_id,
          sender_type: "user",
          text: content,
        })
        .select()
        .single();
      if (error) {
        setMessages((p) => p.filter((m) => m.id !== tmpId));
        return;
      }
      // Remplace le message temporaire par la vraie ligne
      setMessages((p) => {
        const without = p.filter((m) => m.id !== tmpId);
        return without.some((m) => m.id === data.id)
          ? without
          : [...without, data];
      });
    },
    [roomId, user_id, inputText]
  );

  const askAI = useCallback(
    async (topic) => {
      if (!roomId || aiThinking) return;
      setAiThinking(true);
      try {
        const recent = messagesRef.current
          .slice(-16)
          .map(function (m) {
            var who =
              m.sender_type === "ai"
                ? "IA"
                : m.sender_id === user_id
                  ? "Moi"
                  : "Autre";
            return who + ": " + m.text;
          })
          .join("\n");
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + (session?.access_token || ""),
          },
          body: JSON.stringify({
            system: "IA neutre BAARO débat " + (topic || "") + ". 4-8 phrases max.",
            messages: [{ role: "user", content: recent || "Débat commence." }],
            max_tokens: 600,
          }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        // Pas de message "Pas de réponse." publié pour tout le monde en cas d'échec
        if (!res.ok) return;
        var reply =
          data.reply ||
          (data.content &&
            data.content.find &&
            data.content.find(function (b) {
              return b.type === "text";
            })?.text);
        if (!reply) return;
        await supabase.from("debate_messages").insert({
          room_id: roomId,
          sender_type: "ai",
          text: reply,
        });
      } catch (err) {
        console.error("askAI", err);
      } finally {
        setAiThinking(false);
      }
    },
    [roomId, user_id, aiThinking]
  );

  return {
    messages,
    loading,
    sendText,
    askAI,
    aiThinking,
    inputText,
    setInputText,
  };
}

export function useDebateLive(room, user_id, isHost) {
  const callRef = useRef(null);
  const containerRef = useRef(null);
  const joiningRef = useRef(false);
  const aliveRef = useRef(true);
  const camFailedRef = useRef(false);
  const [camOn, setCamOn] = useState(room?.mode !== "audio");
  const [micOn, setMicOn] = useState(true);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [joining, setJoining] = useState(false);

  const joinLive = useCallback(
    async function () {
      if (!room?.id || !user_id) return;
      // Garde anti double-clic (le state "joining" arrive trop tard)
      if (joiningRef.current) return;
      joiningRef.current = true;
      camFailedRef.current = false;
      setJoining(true);
      setError(null);
      setNotice(null);
      setAudioOnly(false);
      try {
        // ---- Repli automatique : caméra refusée => audio seul, jamais d'erreur bloquante ----
        var wantVideo = room.mode !== "audio";
        var devices = await checkDevices(wantVideo);
        var plan = buildJoinPlan(wantVideo, devices);
        var videoOff = plan.videoOff;
        var audioOff = plan.audioOff;
        var message = plan.message;

        // Laisse Android libérer la caméra avant que Daily la reprenne
        await new Promise(function (r) {
          setTimeout(r, 400);
        });

        var sessionRes = await supabase.auth.getSession();
        var session = sessionRes.data?.session;
        var meta = (session && session.user && session.user.user_metadata) || {};
        var displayName =
          String(meta.full_name || meta.name || meta.username || "")
            .trim()
            .slice(0, 40) || (isHost ? "Hôte" : "Participant");

        var res = await fetch(apiUrl("/api/live"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + (session?.access_token || ""),
          },
          body: JSON.stringify({
            action: "token",
            liveId: room.invite_code || room.id,
            roomName: room.daily_room_name || room.invite_code,
            userName: displayName,
            isOwner: !!isHost,
          }),
        });

        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || !data.token) {
          throw new Error(data.error || "Impossible d'obtenir le token Daily");
        }

        var domain = import.meta.env.VITE_DAILY_DOMAIN || "baaro";
        var roomUrl =
          data.url ||
          (data.roomName
            ? "https://" + domain + ".daily.co/" + data.roomName
            : null);
        if (!roomUrl) throw new Error("URL Daily manquante");

        if (!aliveRef.current) return;
        if (!containerRef.current) throw new Error("Zone vidéo indisponible");

        // Détruit TOUTE instance Daily existante avant d'en créer une
        callRef.current = null;
        await destroyExistingCall();

        var call = DailyIframe.createFrame(containerRef.current, {
          iframeStyle: { width: "100%", height: "100%", border: "0" },
          showLeaveButton: false,
          startVideoOff: videoOff,
          startAudioOff: audioOff,
        });
        callRef.current = call;

        call.on("camera-error", function (ev) {
          if (callRef.current !== call) return;
          // Jamais bloquant : on continue avec le micro
          camFailedRef.current = true;
          setNotice(describeDailyCameraError(ev));
          setAudioOnly(true);
          setCamOn(false);
          try {
            call.setLocalVideo(false);
          } catch (_) {}
        });
        call.on("started-camera", function () {
          if (callRef.current !== call) return;
          // La caméra a fini par démarrer (autorisation accordée) : on sort du mode audio seul
          camFailedRef.current = false;
          setAudioOnly(false);
          setCamOn(true);
          setNotice(null);
        });
        call.on("left-meeting", function () {
          setJoined(false);
        });
        call.on("error", function (ev) {
          if (callRef.current !== call) return;
          setError(
            (ev && typeof ev.errorMsg === "string" && ev.errorMsg) ||
              "Connexion au live perdue."
          );
          setJoined(false);
        });

        await withTimeout(
          call.join({ url: roomUrl, token: data.token }),
          15000,
          "Connexion Daily trop longue. Vérifiez DAILY_DOMAIN et la caméra/micro."
        );

        if (!aliveRef.current) {
          await destroyExistingCall();
          callRef.current = null;
          return;
        }

        // Une erreur caméra survenue pendant la connexion compte aussi
        var effectiveVideoOff = videoOff || camFailedRef.current;

        // Ces réglages ne doivent jamais faire échouer la connexion
        try {
          await call.setLocalAudio(!audioOff);
        } catch (_) {}
        if (effectiveVideoOff) {
          try {
            await call.setLocalVideo(false);
          } catch (_) {}
        }

        setMicOn(!audioOff);
        setCamOn(!effectiveVideoOff);
        setAudioOnly(wantVideo && effectiveVideoOff);
        if (message) setNotice(message);
        setJoined(true);
      } catch (e) {
        // En cas d'échec, on nettoie pour que le prochain essai reparte propre
        await destroyExistingCall();
        callRef.current = null;
        if (aliveRef.current) {
          setError(e.message || "Erreur join live");
          setJoined(false);
        }
      } finally {
        joiningRef.current = false;
        if (aliveRef.current) setJoining(false);
      }
    },
    [room, user_id, isHost]
  );

  const toggleCam = useCallback(function () {
    var call = callRef.current;
    if (!call) return;
    try {
      var next = !call.localVideo();
      call.setLocalVideo(next);
      setCamOn(next);
    } catch (_) {}
  }, []);

  const toggleMic = useCallback(function () {
    var call = callRef.current;
    if (!call) return;
    try {
      var next = !call.localAudio();
      call.setLocalAudio(next);
      setMicOn(next);
    } catch (_) {}
  }, []);

  const leaveLive = useCallback(async function () {
    try {
      await destroyExistingCall();
    } finally {
      callRef.current = null;
      if (aliveRef.current) {
        setJoined(false);
        setNotice(null);
        setAudioOnly(false);
      }
    }
  }, []);

  // Nettoyage au démontage (changement d'onglet, retour en arrière...)
  useEffect(function () {
    aliveRef.current = true;
    return function () {
      aliveRef.current = false;
      callRef.current = null;
      destroyExistingCall();
    };
  }, []);

  return {
    joinLive,
    leaveLive,
    toggleCam,
    toggleMic,
    camOn,
    micOn,
    joined,
    joining,
    error,
    notice,
    audioOnly,
    callRef,
    containerRef,
  };
}
