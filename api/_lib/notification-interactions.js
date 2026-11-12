
/**
 * Vérification serveur des interactions avant notification.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

async function rowExists(query, label) {
  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error(
      "[notification-interactions]",
      label,
      error.message || error
    );
    return false;
  }

  return Boolean(data);
}

async function targetMatchesRecipient(
  admin,
  contentType,
  targetId,
  recipientId
) {
  const table = contentType === "post" ? "posts" : "videos";

  const { data, error } = await admin
    .from(table)
    .select("id, author_id")
    .eq("id", targetId)
    .maybeSingle();

  if (error) {
    console.error(
      "[notification-interactions] load target:",
      error.message || error
    );
    return false;
  }

  return Boolean(data && data.author_id === recipientId);
}

export async function interactionHappened(
  admin,
  {
    contentType,
    interactionType,
    actorId,
    targetId,
    recipientId,
    eventId,
  } = {}
) {
  if (
    !admin ||
    !isUuid(actorId) ||
    !isUuid(targetId) ||
    !isUuid(recipientId) ||
    actorId === recipientId
  ) {
    return false;
  }

  try {
    // Demandes d'amis et acceptations.
    if (contentType === "user") {
      if (targetId !== recipientId) return false;

      if (interactionType === "friend_request") {
        return rowExists(
          admin
            .from("follows")
            .select("follower_id")
            .eq("follower_id", actorId)
            .eq("followed_id", recipientId)
            .eq("is_friend", true)
            .eq("status", "pending"),
          "friend_request"
        );
      }

      if (interactionType === "friend_accepted") {
        return rowExists(
          admin
            .from("follows")
            .select("follower_id")
            .eq("follower_id", recipientId)
            .eq("followed_id", actorId)
            .eq("is_friend", true)
            .eq("status", "accepted"),
          "friend_accepted"
        );
      }

      return false;
    }

    if (contentType !== "post" && contentType !== "video") {
      return false;
    }

    // Vérifie l'existence du contenu et son véritable auteur.
    const validTarget = await targetMatchesRecipient(
      admin,
      contentType,
      targetId,
      recipientId
    );

    if (!validTarget) return false;

    // Likes : vérifie la ligne réellement enregistrée.
    if (interactionType === "like") {
      const table =
        contentType === "post" ? "post_likes" : "video_likes";

      const foreignKey =
        contentType === "post" ? "post_id" : "video_id";

      return rowExists(
        admin
          .from(table)
          .select(foreignKey)
          .eq(foreignKey, targetId)
          .eq("user_id", actorId),
        `${contentType}_like`
      );
    }

    // Commentaires : vérifie l'identifiant, le contenu et l'auteur.
    if (interactionType === "comment") {
      if (!isUuid(eventId)) return false;

      const table =
        contentType === "post" ? "comments" : "video_comments";

      const foreignKey =
        contentType === "post" ? "post_id" : "video_id";

      return rowExists(
        admin
          .from(table)
          .select("id")
          .eq("id", eventId)
          .eq(foreignKey, targetId)
          .eq("author_id", actorId),
        `${contentType}_comment`
      );
    }

    // Le schéma actuel ne fournit pas de journal dédié
    // aux événements de partage et de repost.
    if (
      interactionType === "share" ||
      interactionType === "repost"
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(
      "[notification-interactions] verification failed:",
      error?.message || error
    );
    return false;
  }
}
