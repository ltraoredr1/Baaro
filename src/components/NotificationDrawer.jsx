import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}


const COLORS = {
  ivory: "#F5F0E6",
  gold: "#D4AF37",
  muted: "#A9A39A",
  panel: "#151515",
  border: "#2A2A2A",
};

export function NotificationDrawer({ userId, isOpen, onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setNotifs([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
     .from("notifications")
     .select("notification_id,user_id,type,message,source_id,actor_id,read,read_at,created_at")
     .eq("user_id", userId)
     .order("created_at", { ascending: false })
     .limit(30);

    if (fetchError) {
      console.error("Erreur chargement notifications:", fetchError);
      setError(fetchError.message);
      setNotifs([]);
    } else {
      setNotifs(data || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!isOpen || !isValidAuthUserId(userId)) return;
    load();
  }, [isOpen, userId, load]);

  // Realtime uniquement quand le panneau est ouvert pour éviter une connexion permanente.
  useEffect(() => {
    if (!isOpen || !isValidAuthUserId(userId)) return;
    const channel = supabase
     .channel(`notif-drawer-${userId}`)
     .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new;
          setNotifs((prev) => prev.some(i => i.notification_id === n.notification_id)? prev : [n,...prev].slice(0, 30));
        }
      )
     .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const upd = payload.new;
          setNotifs((prev) => prev.map(i => i.notification_id === upd.notification_id? upd : i));
        }
      )
     .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const deletedId = payload.old?.notification_id;
          if (!deletedId) { load(); return; }
          setNotifs((prev) => prev.filter(i => i.notification_id!== deletedId));
        }
      )
     .subscribe((status) => {
        if (status === "CHANNEL_ERROR") console.error("Erreur Realtime notifications");
      });

    return () => { supabase.removeChannel(channel); };
  }, [isOpen, userId, load]);

  // Lock scroll + Escape
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  const unreadCount = useMemo(() => notifs.filter(n =>!n.read).length, [notifs]);

  const markAsRead = async (notificationId) => {
    if (!notificationId ||!userId) return;
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map(n => n.notification_id === notificationId? {...n, read: true, read_at: now} : n));
    const { error: updateError } = await supabase.from("notifications").update({ read: true, read_at: now }).eq("notification_id", notificationId).eq("user_id", userId);
    if (updateError) console.error("Erreur marquage notification:", updateError);
  };

  const markAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map(n => ({...n, read: true, read_at: n.read_at || now})));
    const { error: updateError } = await supabase.from("notifications").update({ read: true, read_at: now }).eq("user_id", userId).eq("read", false);
    if (updateError) console.error("Erreur marquage toutes notifications:", updateError);
  };

  const deleteNotification = async (notificationId) => {
    if (!notificationId ||!userId) return;
    setNotifs((prev) => prev.filter(n => n.notification_id!== notificationId));
    const { error: deleteError } = await supabase.from("notifications").delete().eq("notification_id", notificationId).eq("user_id", userId);
    if (deleteError) console.error("Erreur suppression notification:", deleteError);
  };

  const deleteAllNotifications = async () => {
    if (!userId || notifs.length === 0) return;
    setNotifs([]);
    const { error: deleteError } = await supabase.from("notifications").delete().eq("user_id", userId);
    if (deleteError) console.error("Erreur suppression toutes notifications:", deleteError);
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        style={{ backgroundColor: COLORS.panel, borderLeft: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <div>
            <div className="text-base font-bold" style={{ color: COLORS.ivory }}>Notifications</div>
            {unreadCount > 0 && <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>{unreadCount} non lue{unreadCount > 1? "s" : ""}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-lg hover:bg-white/5" style={{ color: COLORS.ivory }} aria-label="Fermer">×</button>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={markAllAsRead} disabled={unreadCount === 0} className="text-xs disabled:opacity-40 hover:underline" style={{ color: COLORS.gold }}>Tout marquer comme lu</button>
          <button type="button" onClick={deleteAllNotifications} disabled={notifs.length === 0} className="text-xs disabled:opacity-40 hover:underline" style={{ color: COLORS.muted }}>Tout supprimer</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="px-4 py-8 text-center text-sm" style={{ color: COLORS.muted }}>Chargement…</div>}
          {!loading && error && (
            <div className="px-4 py-8 text-center">
              <div className="text-sm" style={{ color: "#F87171" }}>Impossible de charger les notifications.</div>
              <button type="button" onClick={load} className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ color: COLORS.ivory, borderColor: COLORS.border }}>Réessayer</button>
            </div>
          )}
          {!loading &&!error && notifs.length === 0 && <div className="px-4 py-12 text-center text-sm" style={{ color: COLORS.muted }}>Aucune notification.</div>}
          {!loading &&!error && notifs.length > 0 && (
            <div>
              {notifs.map((notification) => {
                const unread =!notification.read;
                return (
                  <div key={notification.notification_id} className="relative flex gap-3 px-4 py-4 hover:bg-white/[0.02]" style={{ backgroundColor: unread? "rgba(212,175,55,0.06)" : "transparent", borderBottom: `1px solid ${COLORS.border}` }}>
                    <div className="pt-1"><span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: unread? COLORS.gold : "transparent" }} /></div>
                    <button type="button" onClick={() =>!notification.read && markAsRead(notification.notification_id)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm" style={{ color: COLORS.ivory, fontWeight: unread? 600 : 400 }}>{notification.message || "Nouvelle notification"}</div>
                      <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>{formatDate(notification.created_at)}</div>
                    </button>
                    <button type="button" onClick={() => deleteNotification(notification.notification_id)} className="shrink-0 text-sm p-1 hover:bg-white/10 rounded" style={{ color: COLORS.muted }} aria-label="Supprimer la notification">×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
