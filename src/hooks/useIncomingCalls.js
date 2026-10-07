import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { getCallToken } from "../lib/chatCalls.js";

export function useIncomingCalls(userId) {
  const [incoming, setIncoming] = useState(null);
  const clear = useCallback(() => setIncoming(null), []);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`calls:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
        async ({ new: call }) => {
          if (call.status !== "ringing") return;
          try {
            const { data: p } = await supabase.from("profiles")
              .select("display_name, avatar_url, flag").eq("id", call.caller_id).maybeSingle();
            const t = await getCallToken({ roomName: call.daily_room_name, userName: "Moi", isOwner: false });
            setIncoming({
              callRecord: call,
              callType: call.type === "video" ? "video" : "voice",
              roomUrl: t.url, token: t.token,
              otherUser: { name: p?.display_name || "Membre", avatar: p?.avatar_url, flag: p?.flag },
            });
          } catch (e) { console.error("appel entrant:", e); }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
        ({ new: call }) => {
          setIncoming((cur) =>
            cur && cur.callRecord.id === call.id && ["ended", "rejected", "missed"].includes(call.status) ? null : cur);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  return { incoming, clear };
}
