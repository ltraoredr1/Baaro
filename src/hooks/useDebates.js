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
    async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
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
  // ... (chat code inchangé)
}

export function useDebateLive(room, user_id, isHost) {
  // ... (live code inchangé)
}
