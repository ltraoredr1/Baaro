import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const COLORS = {
  ivory: "#F5F0E6",
  gold: "#D4AF37",
  muted: "#A9A39A",
  panel: "#151515",
  border: "#2A2A2A",
};

export function NotificationDrawer({
  userId,
  isOpen,
  onClose,
}) {
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
      .select(`
        notification_id,
        user_id,
        type,
        message,
        source_id,
        actor_id,
        read,
        read_at,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (fetchError) {
      console.error(
        "Erreur chargement notifications:",
        fetchError
      );
      setError(fetchError.message);
      setNotifs([]);
    } else {
      setNotifs(data || []);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;

    load();
  }, [isOpen, userId, load]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`notif-drawer-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new;

          setNotifs((prev) => {
            if (
              prev.some(
                (item) =>
                  item.notification_id ===
                  notification.notification_id
              )
            ) {
              return prev;
            }

            return [notification, ...prev].slice(0, 30);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new;

          setNotifs((prev) =>
            prev.map((item) =>
              item.notification_id ===
              updated.notification_id
                ? updated
                : item
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId =
            payload.old?.notification_id;

          if (!deletedId) {
            load();
            return;
          }

          setNotifs((prev) =>
            prev.filter(
              (item) =>
                item.notification_id !== deletedId
            )
          );
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error(
            "Erreur Realtime notifications"
          );
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const unreadCount = useMemo(() => {
    return notifs.filter(
      (notification) => !notification.read
    ).length;
  }, [notifs]);

  const markAsRead = async (notificationId) => {
    if (!notificationId || !userId) return;

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        read: true,
        read_at: now,
      })
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (updateError) {
      console.error(
        "Erreur marquage notification:",
        updateError
      );
      return;
    }

    setNotifs((prev) =>
      prev.map((notification) =>
        notification.notification_id === notificationId
          ? {
              ...notification,
              read: true,
              read_at: now,
            }
          : notification
      )
    );
  };

  const markAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        read: true,
        read_at: now,
      })
      .eq("user_id", userId)
      .eq("read", false);

    if (updateError) {
      console.error(
        "Erreur marquage toutes notifications:",
        updateError
      );
      return;
    }

    setNotifs((prev) =>
      prev.map((notification) => ({
        ...notification,
        read: true,
        read_at: notification.read_at || now,
      }))
    );
  };

  const deleteNotification = async (notificationId) => {
    if (!notificationId || !userId) return;

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error(
        "Erreur suppression notification:",
        deleteError
      );
      return;
    }

    setNotifs((prev) =>
      prev.filter(
        (notification) =>
          notification.notification_id !== notificationId
      )
    );
  };

  const deleteAllNotifications = async () => {
    if (!userId || notifs.length === 0) return;

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      console.error(
        "Erreur suppression toutes notifications:",
        deleteError
      );
      return;
    }

    setNotifs([]);
  };

  const formatDate = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-hidden shadow-2xl"
        style={{
          backgroundColor: COLORS.panel,
          borderLeft: `1px solid ${COLORS.border}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div>
            <div
              className="text-base font-bold"
              style={{ color: COLORS.ivory }}
            >
              Notifications
            </div>

            {unreadCount > 0 && (
              <div
                className="mt-1 text-xs"
                style={{ color: COLORS.muted }}
              >
                {unreadCount} non lue
                {unreadCount > 1 ? "s" : ""}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-lg"
            style={{ color: COLORS.ivory }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div
          className="flex items-center justify-between gap-2 px-4 py-3"
          style={{
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="text-xs disabled:opacity-40"
            style={{ color: COLORS.gold }}
          >
            Tout marquer comme lu
          </button>

          <button
            type="button"
            onClick={deleteAllNotifications}
            disabled={notifs.length === 0}
            className="text-xs disabled:opacity-40"
            style={{ color: COLORS.muted }}
          >
            Tout supprimer
          </button>
        </div>

        <div className="h-[calc(100%-126px)] overflow-y-auto">
          {loading && (
            <div
              className="px-4 py-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Chargement…
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-8 text-center">
              <div
                className="text-sm"
                style={{ color: "#F87171" }}
              >
                Impossible de charger les notifications.
              </div>

              <button
                type="button"
                onClick={load}
                className="mt-3 rounded-lg border px-3 py-2 text-xs"
                style={{
                  color: COLORS.ivory,
                  borderColor: COLORS.border,
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {!loading && !error && notifs.length === 0 && (
            <div
              className="px-4 py-12 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Aucune notification.
            </div>
          )}

          {!loading && !error && notifs.length > 0 && (
            <div>
              {notifs.map((notification) => {
                const unread = !notification.read;

                return (
                  <div
                    key={notification.notification_id}
                    className="relative flex gap-3 px-4 py-4"
                    style={{
                      backgroundColor: unread
                        ? "rgba(212,175,55,0.06)"
                        : "transparent",
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div className="pt-1">
                      <span
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: unread
                            ? COLORS.gold
                            : "transparent",
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        !notification.read &&
                        markAsRead(notification.notification_id)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className="text-sm"
                        style={{
                          color: COLORS.ivory,
                          fontWeight: unread ? 600 : 400,
                        }}
                      >
                        {notification.message ||
                          "Nouvelle notification"}
                      </div>

                      <div
                        className="mt-1 text-xs"
                        style={{ color: COLORS.muted }}
                      >
                        {formatDate(notification.created_at)}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteNotification(
                          notification.notification_id
                        )
                      }
                      className="shrink-0 text-sm"
                      style={{ color: COLORS.muted }}
                      aria-label="Supprimer la notification"
                    >
                      ×
                    </button>
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
