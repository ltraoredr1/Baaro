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

/**
 * Daily n'autorise qu'UNE seule instance à la fois dans toute la page.
 * Cette fonction détruit toute instance existante (même celle créée
 * par un rendu précédent, un join raté ou un autre écran).
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
 * Retourne true si l'accès est accordé.
 */
async function probeMedia(constraints) {
  try {
    var s = await navigator.mediaDevices.getUserMedia(constraints);
    s.getTracks().forEach(function (t) {
      t.stop();
    });
    return true;
  } catch (_) {
    return false;
  }
}

export function useDebates(user_id) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

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
      .channel("debate-rooms:" + user_id)
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
      try {
        const code = Math.random().toString(36).substring(2, 8).toLowerCase();
        const { data: room, error: e1 } = await supabase
          .from("debate_rooms")
          .insert({
            title: (title || "Débat").slice(0, 120),
            topic: (topic || "").slice(0, 300),
            mode: mode || "text",
            max_participants: Math.min(Math.max(maxParticipants || 8, 2), 100),
            ai_enabled: !!aiEnabled,
            host_id: user_id,
            invite_code: code,
            status: "active",
          })
          .select()
          .single();
        if (e1) throw e1;

        const { error: e2 } = await supabase.from("debate_participants").insert({
          room_id: room.id,
          user_id: user_id,
          role: "host",
        });
        if (e2) throw e2;

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
      try {
        const { data: room, error } = await supabase
          .from("debate_rooms")
          .select("*")
          .ilike("invite_code", c)
          .eq("status", "active")
          .maybeSingle();
        if (error || !room) throw new Error("Code invalide");

        await supabase.from("debate_participants").upsert(
          {
            room_id: room.id,
            user_id: user_id,
            role: "member",
            left_at: null,
          },
          { onConflict: "room_id,user_id" }
        );
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!roomId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("debate_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(300);
      setMessages(data || []);
      setLoading(false);
    })();
    const ch = supabase
      .channel("debate-messages:" + roomId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "debate_messages",
          filter: "room_id=eq." + roomId,
        },
        (p) =>
          setMessages((prev) =>
            prev.some((m) => m.id === p.new.id) ? prev : [...prev, p.new]
          )
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
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
      const { error } = await supabase.from("debate_messages").insert({
        room_id: roomId,
        sender_id: user_id,
        sender_type: "user",
        text: content,
      });
      if (error) setMessages((p) => p.filter((m) => m.id !== tmpId));
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
        var reply =
          data.reply ||
          (data.content &&
            data.content.find &&
            data.content.find(function (b) {
              return b.type === "text";
            })?.text) ||
          "Pas de réponse.";
        await supabase.from("debate_messages").insert({
          room_id: roomId,
          sender_type: "ai",
          text: reply,
        });
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
      setJoining(true);
      setError(null);
      setNotice(null);
      setAudioOnly(false);
      try {
        // ---- Repli automatique si caméra / micro indisponibles ----
        var wantVideo = room.mode !== "audio";
        var videoOff = !wantVideo;
        var audioOff = false;
        var message = null;
        var probed = false;

        if (
          typeof navigator !== "undefined" &&
          navigator.mediaDevices &&
          navigator.mediaDevices.getUserMedia
        ) {
          probed = true;
          if (wantVideo) {
            if (await probeMedia({ video: true, audio: true })) {
              // tout est accessible
            } else if (await probeMedia({ audio: true })) {
              videoOff = true;
              message = "Caméra indisponible : tu rejoins en audio seul.";
            } else {
              videoOff = true;
              audioOff = true;
              message =
                "Caméra et micro indisponibles : tu rejoins en écoute seule. Autorise-les dans les réglages du site pour participer.";
            }
          } else if (!(await probeMedia({ audio: true }))) {
            audioOff = true;
            message =
              "Micro indisponible : tu rejoins en écoute seule. Autorise le micro dans les réglages du site.";
          }
        }

        if (probed) {
          // Laisse Android libérer la caméra avant que Daily la reprenne
          await new Promise(function (r) {
            setTimeout(r, 400);
          });
        }

        var sessionRes = await supabase.auth.getSession();
        var session = sessionRes.data?.session;

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
            userName: isHost ? "Hôte" : "Participant",
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

        // CORRECTIF : détruit TOUTE instance Daily existante avant d'en créer une
        callRef.current = null;
        await destroyExistingCall();

        var call = DailyIframe.createFrame(containerRef.current, {
          iframeStyle: { width: "100%", height: "100%", border: "0" },
          showLeaveButton: false,
          startVideoOff: videoOff,
          startAudioOff: audioOff,
        });
        callRef.current = call;
        call.on("camera-error", function () {
          // Pas d'erreur bloquante : on continue en audio seul
          setNotice("Caméra indisponible : tu continues en audio seul.");
          setAudioOnly(true);
          setCamOn(false);
          try {
            call.setLocalVideo(false);
          } catch (_) {}
        });
        call.on("left-meeting", function () {
          setJoined(false);
        });

        await Promise.race([
          call.join({ url: roomUrl, token: data.token }),
          new Promise(function (_, rej) {
            setTimeout(function () {
              rej(
                new Error(
                  "Connexion Daily trop longue. Vérifiez DAILY_DOMAIN et la caméra/micro."
                )
              );
            }, 15000);
          }),
        ]);

        // Ces réglages ne doivent jamais faire échouer la connexion
        try {
          await call.setLocalAudio(!audioOff);
        } catch (_) {}
        try {
          await call.setLocalVideo(!videoOff);
        } catch (_) {}

        setMicOn(!audioOff);
        setCamOn(!videoOff);
        setAudioOnly(wantVideo && videoOff);
        if (message) setNotice(message);
        setJoined(true);
      } catch (e) {
        // En cas d'échec, on nettoie pour que le prochain essai reparte propre
        await destroyExistingCall();
        callRef.current = null;
        setError(e.message || "Erreur join live");
        setJoined(false);
      } finally {
        joiningRef.current = false;
        setJoining(false);
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
      setJoined(false);
      setNotice(null);
      setAudioOnly(false);
    }
  }, []);

  // Nettoyage au démontage (changement d'onglet, retour en arrière...)
  useEffect(function () {
    return function () {
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
