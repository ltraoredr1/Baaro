import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const COLORS = {
  ivory: "#F5F0E6",
  gold: "#D4AF37",
  muted: "#A9A39A",
  panel: "#151515",
  border: "#2A2A2A",
};

/** Nom visible : nom complet, puis pseudo, puis valeur de secours. */
function actorLabel(profile) {
  if (!profile) return "Quelqu'un";

  const displayName = String(profile.display_name || "").trim();
  if (displayName) return displayName;

  const username = String(profile.username || profile.handle || "").trim();

  if (username) {
    return username.startsWith("@") ? username : `@${username}`;
  }

  return "Quelqu'un";
}

/** Messages adaptés aux types de notifications BAARO. */
function messageForNotification(notification, profile) {
  const label = actorLabel(profile);

  switch (String(notification.type || "").toLowerCase()) {
    case "follow":
      return `${label} a commencé à vous suivre`;

    case "friend_request":
      return `${label} vous a envoyé une demande d'ami`;

    case "friend_accepted":
      return `${label} a accepté votre demande d'ami`;

    case "like":
    case "reaction":
      return `${label} a aimé votre publication`;

    case "repost":
    case "post_repost":
      return `${label} a républié votre publication`;

    case "comment":
      return `${label} a commenté votre publication`;

    case "share":
    case "post_share":
      return `${label} a partagé votre publication`;

    case "video_like":
      return `${label} a aimé votre vidéo`;

    case "video_share":
      return `${label} a partagé votre vidéo`;

    case "video_repost":
      return `${label} a reposté votre vidéo`;

    case "video_comment":
      return `${label} a commenté votre vidéo`;

    case "story_reaction":
      return `${label} a réagi à votre story`;

    case "story_share":
      return `${label} a partagé votre story`;

    case "mention":
      return `${label} vous a mentionné`;

    case "new_live":
      return `${label} a démarré un live`;

    case "new_debate":
      return `${label} a démarré un débat`;

    case "message":
      return notification.message || `${label} vous a envoyé un message`;

    case "incoming_call":
      return notification.message || `${label} vous appelle`;

    default:
      return notification.message || "Nouvelle notification";
  }
}

async function attachActorProfiles(notifications) {
  const items = notifications || [];

  const actorIds = [
    ...new Set(items.map((item) => item.actor_id).filter(Boolean)),
  ];

  if (actorIds.length === 0) {
    return items.map((item) => ({
      ...item,
      message: messageForNotification(item, null),
    }));
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", actorIds);

  if (error) {
    console.error("Erreur chargement profils des notifications:", error);

    return items.map((item) => ({
      ...item,
      message: messageForNotification(item, null),
    }));
  }

  const profilesById = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
  );

  return items.map((item) => {
    const actor = profilesById.get(item.actor_id) || null;

    return {
      ...item,
      actor,
      message: messageForNotification(item, actor),
      actorName: actorLabel(actor),
    };
  });
}

export function NotificationDrawer({ user_id, isOpen, onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isValidAuthUserId(user_id)) {
      setNotifs([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (fetchError) throw fetchError;

      const enriched = await attachActorProfiles(data || []);
      setNotifs(enriched);
    } catch (err) {
      console.error("Erreur chargement notifications:", err);
      setError(err?.message || "Erreur inconnue");
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, [user_id]);

  useEffect(() => {
    if (!isOpen || !isValidAuthUserId(user_id)) return;
    load();
  }, [isOpen, user_id, load]);

  // Actualise la liste et les noms lorsqu'une notification change.
  useEffect(() => {
    if (!isOpen || !isValidAuthUserId(user_id)) return;

    const channel = supabase
      .channel(`notif-drawer-${user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user_id}`,
        },
        () => {
          load();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Erreur Realtime notifications");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, user_id, load]);

  // Bloque le défilement de la page et permet de fermer avec Échap.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const unreadCount = useMemo(
    () => notifs.filter((notification) => !notification.read).length,
    [notifs],
  );

  const markAsRead = async (notificationId) => {
    if (!notificationId || !user_id) return;

    const now = new Date().toISOString();

    setNotifs((previous) =>
      previous.map((notification) =>
        notification.notification_id === notificationId
          ? { ...notification, read: true, read_at: now }
          : notification,
      ),
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("notification_id", notificationId)
      .eq("user_id", user_id);

    if (updateError) {
      console.error("Erreur marquage notification:", updateError);
      load();
    }
  };

  const markAllAsRead = async () => {
    if (!user_id || unreadCount === 0) return;

    const now = new Date().toISOString();

    setNotifs((previous) =>
      previous.map((notification) => ({
        ...notification,
        read: true,
        read_at: notification.read_at || now,
      })),
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("user_id", user_id)
      .eq("read", false);

    if (updateError) {
      console.error("Erreur marquage toutes notifications:", updateError);
      load();
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!notificationId || !user_id) return;

    const previous = notifs;

    setNotifs((items) =>
      items.filter(
        (notification) => notification.notification_id !== notificationId,
      ),
    );

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("notification_id", notificationId)
      .eq("user_id", user_id);

    if (deleteError) {
      console.error("Erreur suppression notification:", deleteError);
      setNotifs(previous);
    }
  };

  const deleteAllNotifications = async () => {
    if (!user_id || notifs.length === 0) return;

    const previous = notifs;
    setNotifs([]);

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user_id);

    if (deleteError) {
      console.error("Erreur suppression toutes notifications:", deleteError);
      setNotifs(previous);
    }
  };

  const formatDate = (value) => {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openNotification = async (notification) => {
    if (!notification) return;
    if (!notification.read) {
      await markAsRead(notification.notification_id);
    }

    if (
      (notification.type === "new_live" || notification.type === "new_debate") &&
      notification.source_id
    ) {
      window.dispatchEvent(
        new CustomEvent("baaro:open-debate", {
          detail: { roomId: notification.source_id },
        }),
      );
      onClose?.();
    }

    if (notification.type === "message") {
      window.dispatchEvent(new CustomEvent("baaro:open-message", {
        detail: { conversationId: notification.conversation_id || null },
      }));
      onClose?.();
    }

    if (notification.type === "incoming_call" && notification.source_id) {
      window.dispatchEvent(new CustomEvent("baaro:open-call", {
        detail: { callId: notification.source_id },
      }));
      onClose?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200"
        style={{
          backgroundColor: COLORS.panel,
          borderLeft: `1px solid ${COLORS.border}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: `1px solid ${COLORS.border}` }}
        >
          <div>
            <div
              className="text-base font-bold"
              style={{ color: COLORS.ivory }}
            >
              Notifications
            </div>

            {unreadCount > 0 && (
              <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-lg hover:bg-white/5"
            style={{ color: COLORS.ivory }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div
          className="flex items-center justify-between gap-2 px-4 py-3"
          style={{ borderBottom: `1px solid ${COLORS.border}` }}
        >
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="text-xs hover:underline disabled:opacity-40"
            style={{ color: COLORS.gold }}
          >
            Tout marquer comme lu
          </button>

          <button
            type="button"
            onClick={deleteAllNotifications}
            disabled={notifs.length === 0}
            className="text-xs hover:underline disabled:opacity-40"
            style={{ color: COLORS.muted }}
          >
            Tout supprimer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
              <div className="text-sm" style={{ color: "#F87171" }}>
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
                    className="relative flex gap-3 px-4 py-4 hover:bg-white/[0.02]"
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

                    {notification.actor && (
                      <img
                        src={
                          notification.actor.avatar_url ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(notification.actorName || "A")}`
                        }
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                        style={{ border: `1px solid ${COLORS.border}` }}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className="text-sm leading-snug"
                        style={{
                          color: COLORS.ivory,
                          fontWeight: unread ? 600 : 400,
                        }}
                      >
                        {notification.actorName &&
                        notification.message?.startsWith(notification.actorName) ? (
                          <>
                            <span style={{ color: COLORS.gold, fontWeight: 700 }}>
                              {notification.actorName}
                            </span>
                            {notification.message.slice(notification.actorName.length)}
                          </>
                        ) : (
                          notification.message || "Nouvelle notification"
                        )}
                      </div>

                      {notification.preview && (
                        <div
                          className="mt-1 line-clamp-2 rounded-md px-2 py-1 text-xs"
                          style={{
                            color: COLORS.muted,
                            background: "rgba(255,255,255,0.04)",
                            borderLeft: `2px solid ${COLORS.gold}`,
                          }}
                        >
                          « {notification.preview} »
                        </div>
                      )}

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
                        deleteNotification(notification.notification_id)
                      }
                      className="shrink-0 rounded p-1 text-sm hover:bg-white/10"
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

export default NotificationDrawer;
