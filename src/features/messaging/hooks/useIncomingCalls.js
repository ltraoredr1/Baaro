import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../../../supabaseClient.js";
import { getCallToken } from "../lib/chatCalls.js";

// Aligné sur NO_ANSWER_TIMEOUT_MS de ChatCallModal
const RECENT_MS = 45000;
const POLL_MS = 10000;
const FINAL_STATUSES = ["ended", "rejected", "missed", "cancelled"];

export function useIncomingCalls(userId) {
  const [incoming, setIncoming] = useState(null);
  const incomingRef = useRef(null);
  const handledRef = useRef(new Set()); // appels déjà traités ou en cours
  const clear = useCallback(() => setIncoming(null), []);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    handledRef.current = new Set();

    const present = async (call) => {
      if (!active || !call?.id || call.status !== "ringing") return;
      if (handledRef.current.has(call.id)) return; // doublon
      if (incomingRef.current) return; // un seul appel à la fois
      handledRef.current.add(call.id);
      try {
        const [{ data: p }, t] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url, flag")
            .eq("id", call.caller_id)
            .maybeSingle(),
          getCallToken({ roomName: call.daily_room_name, userName: "Moi", isOwner: false }),
        ]);
        if (!active) return;
        setIncoming({
          callRecord: call,
          callType: call.type === "video" ? "video" : "voice",
          roomUrl: t.url,
          token: t.token,
          otherUser: { name: p?.display_name || "Membre", avatar: p?.avatar_url, flag: p?.flag },
        });
      } catch (e) {
        // Appel terminé (404/410) ou erreur réseau : on ne le réaffiche pas en boucle
        console.error("appel entrant:", e);
      }
    };

    // Récupère les appels encore en sonnerie (démarrage, reconnexion, retour au premier plan)
    const fetchPending = async () => {
      try {
        const since = new Date(Date.now() - RECENT_MS).toISOString();
        let res = await supabase
          .from("calls")
          .select("*")
          .eq("callee_id", userId)
          .eq("status", "ringing")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(3);
        if (res.error) {
          // Colonne created_at absente : on filtre sans date
          res = await supabase
            .from("calls")
            .select("*")
            .eq("callee_id", userId)
            .eq("status", "ringing")
            .limit(3);
        }
        if (res.error || !active) return;
        const rows = res.data || [];
        const ids = new Set(rows.map((r) => r.id));
        // Un appel affiché qui ne sonne plus (annulé pendant une coupure) disparaît
        setIncoming((cur) => (cur && !ids.has(cur.callRecord.id) ? null : cur));
        for (const call of rows) {
          await present(call);
        }
      } catch (e) {
        console.warn("appels en attente:", e);
      }
    };

    const channel = supabase
      .channel(`calls:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
        ({ new: call }) => present(call)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
        ({ new: call }) => {
          if (FINAL_STATUSES.includes(call.status)) {
            handledRef.current.add(call.id);
            setIncoming((cur) => (cur && cur.callRecord.id === call.id ? null : cur));
          } else {
            present(call); // ex. relance : ringing après un événement manqué
          }
        }
      )
      .subscribe((status) => {
        // SUBSCRIBED est aussi émis après chaque reconnexion automatique
        if (status === "SUBSCRIBED") fetchPending();
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", fetchPending);
    const poll = setInterval(fetchPending, POLL_MS); // filet de sécurité

    return () => {
      active = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", fetchPending);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { incoming, clear };
}
