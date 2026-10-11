/**
 * src/hooks/useIncomingCallFromPush.js
 *
 * Écoute :
 * 1. Query URL  ?open=call&call_id=...&action=accept|reject
 * 2. postMessage du service worker (app déjà ouverte)
 * 3. Capacitor pushNotificationActionPerformed (Android/iOS)
 *
 * Quand un appel arrive alors que BAARO était fermé, on charge
 * l'enregistrement "calls" et on expose un état `incoming` pour
 * afficher ChatCallModal + sonnerie in-app.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { getCallToken } from "../lib/chatCalls.js";

function parseCallParams() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("open") !== "call") return null;
    return {
      call_id: q.get("call_id") || "",
      action: q.get("action") || "accept",
      call_type: q.get("call_type") || "voice",
    };
  } catch {
    return null;
  }
}

function clearCallQuery() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("open") !== "call") return;
    url.searchParams.delete("open");
    url.searchParams.delete("call_id");
    url.searchParams.delete("action");
    url.searchParams.delete("call_type");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {}
}

export function useIncomingCallFromPush(userId) {
  const [incoming, setIncoming] = useState(null);
  const clear = useCallback(() => setIncoming(null), []);

  const loadCall = useCallback(
    async ({ call_id, action, call_type }) => {
      if (!userId || !call_id) return;

      if (action === "reject") {
        await supabase
          .from("calls")
          .update({ status: "rejected", ended_at: new Date().toISOString() })
          .eq("id", call_id)
          .eq("callee_id", userId);
        clearCallQuery();
        return;
      }

      const { data: call, error } = await supabase
        .from("calls")
        .select("*")
        .eq("id", call_id)
        .eq("callee_id", userId)
        .maybeSingle();

      if (error || !call) {
        clearCallQuery();
        return;
      }

      // Appel déjà terminé / refusé
      if (["ended", "rejected", "missed", "accepted"].includes(call.status) && call.status !== "ringing") {
        // Si encore ringing ailleurs, on continue seulement si ringing
        if (call.status !== "ringing") {
          clearCallQuery();
          return;
        }
      }

      if (call.status !== "ringing") {
        clearCallQuery();
        return;
      }

      try {
        const { data: p } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, flag")
          .eq("id", call.caller_id)
          .maybeSingle();

        const t = await getCallToken({
          roomName: call.daily_room_name,
          userName: "Moi",
          isOwner: false,
        });

        setIncoming({
          mode: "incoming",
          callRecord: call,
          callType: (call.type || call_type) === "video" ? "video" : "voice",
          roomUrl: t.url,
          token: t.token,
          otherUser: {
            name: p?.display_name || "Membre",
            avatar: p?.avatar_url,
            flag: p?.flag || "🌍",
          },
        });
      } catch (e) {
        console.error("[useIncomingCallFromPush]", e);
      }
      clearCallQuery();
    },
    [userId]
  );

  // 1. URL deep link au démarrage
  useEffect(() => {
    if (!userId) return;
    const params = parseCallParams();
    if (params?.call_id) loadCall(params);
  }, [userId, loadCall]);

  // 2. Message du service worker
  useEffect(() => {
    if (!userId) return;
    const onMessage = (event) => {
      const d = event.data;
      if (!d || d.type !== "baaro:incoming_call") return;
      loadCall({
        call_id: d.call_id,
        action: d.action || "accept",
        call_type: d.call_type || "voice",
      });
    };
    navigator.serviceWorker?.addEventListener?.("message", onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.("message", onMessage);
    };
  }, [userId, loadCall]);

  // 3. Capacitor native
  useEffect(() => {
    if (!userId) return;
    let remove;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const handle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const data = action.notification?.data || {};
            if (data.type !== "incoming_call" && !data.call_id) return;
            loadCall({
              call_id: data.call_id,
              action: "accept",
              call_type: data.call_type || "voice",
            });
          }
        );
        remove = () => handle.remove();
      } catch {}
    })();
    return () => {
      try {
        remove?.();
      } catch {}
    };
  }, [userId, loadCall]);

  return { incoming, clear, setIncoming };
}
