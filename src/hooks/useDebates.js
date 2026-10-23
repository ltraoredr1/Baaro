// src/hooks/useDebates.js
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

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function tryEq(column, value) {
  const { data, error } = await supabase
    .from("debate_rooms")
    .select("*")
    .eq(column, value)
    .maybeSingle();
  return { data, error };
}

/**
 * Recherche centralisée d'une salle par UUID ou code d'invitation (insensible à la casse)
 */
export async function getRoomByCodeOrId(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) throw new Error("Code de salle manquant");

  const codeLower = raw.toLowerCase();
  const codeUpper = raw.toUpperCase();
  const isUuid = UUID_RE.test(raw);

  let roomData = null;
  let roomErr = null;

  if (isUuid) {
    ({ data: roomData, error: roomErr } = await tryEq("id", raw));
    if (!roomData && !roomErr) {
      ({ data: roomData, error: roomErr } = await tryEq("invite_code", codeLower));
    }
  } else {
    ({ data: roomData, error: roomErr } = await tryEq("invite_code", codeLower));
    if (!roomData && !roomErr && codeUpper !== codeLower) {
      ({ data: roomData, error: roomErr } = await tryEq("invite_code", codeUpper));
    }
    if (!roomData && !roomErr && raw !== codeLower && raw !== codeUpper) {
      ({ data: roomData, error: roomErr } = await tryEq("invite_code", raw));
    }
  }

  if (roomErr) {
    throw new Error(roomErr.message || "Salle introuvable");
  }
  if (!roomData) throw new Error("Salle introuvable");
  return roomData;
}

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
      return "Caméra refusée : tu rejoins en audio seul avec ton micro.";
    case "missing":
      return "Aucune caméra détectée : tu rejoins en audio seul avec ton micro.";
    case "busy":
      return "Caméra utilisée par une autre application.";
    default:
      return "Caméra indisponible.";
  }
}

function micMessage(reason, withCamera) {
  var tail = withCamera ? "caméra active, sans micro." : "écoute seule.";
  switch (reason) {
    case "denied":
      return "Micro refusé : " + tail;
    case "missing":
      return "Aucun micro détecté : " + tail;
    case "busy":
      return "Micro utilisé par une autre application.";
    default:
      return "Micro indisponible.";
  }
}

function buildJoinPlan(wantVideo, devices) {
  var camReason = wantVideo ? devices.camReason : null;
  var micReason = devices.micReason;
  return {
    videoOff: !wantVideo || !!camReason,
    audioOff: !!micReason,
    message: camReason ? cameraMessage(camReason) : micReason ? micMessage(micReason, wantVideo) : null,
  };
}

function describeDailyCameraError(ev) {
  var type = (ev && ev.error && ev.error.type) || "";
  switch (type) {
    case "permissions":
      return "Caméra refusée : continuation en audio seul.";
    case "not-found":
      return "Aucune caméra détectée.";
    default:
      return "Caméra indisponible.";
  }
}

function withTimeout(promise, ms, message) {
  var timer;
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
    async ({ title, topic, mode, format, maxParticipants, aiEnabled }) => {
      if (!user_id) return { ok: false, reason: "Non authentifié" };
      let room = null;
      try {
        let lastErr = null;
        for (let attempt = 0; attempt < 3 && !room; attempt++) {
          const { data, error } = await supabase
            .from("debate_rooms")
            .insert({
              title: (title || "Débat").slice(0, 120),
              topic: (topic || "").slice(0, 300),
              mode: mode || "text",
              format: format || "standard",
              max_participants: Math.min(Math.max(maxParticipants || 8, 2), 100),
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
      if (joiningRef.current) return;
      joiningRef.current = true;
      camFailedRef.current = false;
      setJoining(true);
      setError(null);
      setNotice(null);
      setAudioOnly(false);
      try {
        var wantVideo = room.mode !== "audio";
        var devices = await checkDevices(wantVideo);
        var plan = buildJoinPlan(wantVideo, devices);
        var videoOff = plan.videoOff;
        var audioOff = plan.audioOff;
        var message = plan.message;

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
          "Connexion Daily trop longue."
        );

        if (!aliveRef.current) {
          await destroyExistingCall();
          callRef.current = null;
          return;
        }

        var effectiveVideoOff = videoOff || camFailedRef.current;

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
