/**
 * /api/social — notifications d'interactions sur les publications et vidéos
 * (like, commentaire, partage, repost). Appelé avec action = "notify_interaction".
 * + demandes d'ami (friend_request) et acceptations (friend_accepted).
 * + action "comment" : insertion serveur du commentaire + notification.
 * Les simples abonnements sont notifiés par le trigger SQL on_follow_created : pas géré ici.
 *
 * Le destinataire est TOUJOURS déterminé côté serveur (auteur du contenu), jamais
 * pris tel quel depuis le client. Chaque interaction est vérifiée quand c'est possible,
 * puis : 1) ligne dans `notifications` (liste dans l'appli), 2) push (FCM / Web Push).
 */
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
} from "./_shared.js";
import { sendPushToUsers } from "./_lib/push.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_COMMENT_LEN = 2000;

// type en base (compris par NotificationDrawer) + verbe pour le push
const CONTENT_TYPES = {
  post: {
    like: { type: "like", verb: "a aimé votre publication" },
    comment: { type: "comment", verb: "a commenté votre publication" },
    share: { type: "share", verb: "a partagé votre publication" },
    repost: { type: "repost", verb: "a républié votre publication" },
  },
  video: {
    like: { type: "video_like", verb: "a aimé votre vidéo" },
    comment: { type: "video_comment", verb: "a commenté votre vidéo" },
    share: { type: "video_share", verb: "a partagé votre vidéo" },
    repost: { type: "video_repost", verb: "a reposté votre vidéo" },
  },
  user: {
    friend_request: {
      type: "friend_request",
      verb: "vous a envoyé une demande d'ami",
    },
    friend_accepted: {
      type: "friend_accepted",
      verb: "a accepté votre demande d'ami",
    },
  },
};

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function sanitizeComment(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_COMMENT_LEN);
}

async function loadContent(admin, contentType, id) {
  const table = contentType === "post" ? "posts" : "videos";
  const { data } = await admin
    .from(table)
    .select("author_id, user_id, text, content, title, description")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const text =
    contentType === "post"
      ? data.text || data.content
      : data.title || data.description;
  return {
    authorId: data.author_id || data.user_id,
    preview: clip(text, 120),
  };
}

// Vérifie que l'action a réellement eu lieu (anti-fausses notifications)
async function interactionHappened(
  admin,
  { contentType, interactionType, actorId, targetId, recipientId }
) {
  if (contentType === "user") {
    const { data: sent } = await admin
      .from("follows")
      .select("status, is_friend")
      .eq("follower_id", actorId)
      .eq("followed_id", recipientId)
      .maybeSingle();
    if (interactionType === "friend_request") {
      return sent?.is_friend === true && sent?.status === "pending";
    }
    // friend_accepted : l'acceptation met à jour la ligne de la personne qui avait demandé
    const { data: received } = await admin
      .from("follows")
      .select("status, is_friend")
      .eq("follower_id", recipientId)
      .eq("followed_id", actorId)
      .maybeSingle();
    return (
      (received?.is_friend === true && received?.status === "accepted") ||
      (sent?.is_friend === true && sent?.status === "accepted")
    );
  }

  if (interactionType === "like") {
    const table = contentType === "post" ? "post_likes" : "video_likes";
    const column = contentType === "post" ? "post_id" : "video_id";
    const { data } = await admin
      .from(table)
      .select("user_id")
      .eq(column, targetId)
      .eq("user_id", actorId)
      .maybeSingle();
    return !!data;
  }
  // commentaire / partage / repost : tables variables selon l'appli
  return true;
}

async function insertNotificationAndPush(admin, {
  recipientId,
  actorId,
  rule,
  sourceId,
  preview,
  contentType,
  targetId,
}) {
  const { data: actor } = await admin
    .from("profiles")
    .select("display_name, handle")
    .eq("id", actorId)
    .maybeSingle();
  const actorName =
    clip(actor?.display_name, 40) ||
    (actor?.handle ? `@${String(actor.handle).replace(/^@/, "")}` : "Quelqu'un");

  const row = {
    user_id: recipientId,
    actor_id: actorId,
    type: rule.type,
    source_id: sourceId,
    message: `${actorName} ${rule.verb}`,
  };

  // `preview` est facultatif : si la colonne n'existe pas encore, on réessaie sans.
  let insert = await admin
    .from("notifications")
    .insert({ ...row, preview: preview || null });
  if (insert.error && /preview/i.test(insert.error.message || "")) {
    insert = await admin.from("notifications").insert(row);
  }
  if (insert.error) throw insert.error;

  const url =
    contentType === "video"
      ? `/?video=${encodeURIComponent(targetId)}`
      : contentType === "post"
        ? `/?post=${encodeURIComponent(targetId)}`
        : "/";

  // Le push ne doit jamais faire échouer la notification enregistrée
  await sendPushToUsers(admin, {
    userIds: [recipientId],
    title: actorName,
    body: preview ? `${rule.verb} : « ${preview} »` : rule.verb,
    url,
    category: "social",
    tag: `social-\( {rule.type}- \){sourceId}`,
    data: { type: rule.type, source_id: sourceId, actor_id: actorId },
  }).catch((err) => console.warn("[social] push", err?.message || err));
}

async function handleNotifyInteraction(admin, user, body) {
  const contentType = String(body.content_type || "").toLowerCase();
  const interactionType = String(body.interaction_type || "").toLowerCase();
  const rule = CONTENT_TYPES[contentType]?.[interactionType];
  if (!rule) {
    return { status: 400, body: { ok: false, error: "Type d'interaction invalide" } };
  }

  const targetId = String(
    body.target_id || body.content_id || body.recipient_id || ""
  );
  if (!targetId || !isUuid(targetId)) {
    return { status: 400, body: { ok: false, error: "Cible invalide" } };
  }

  let recipientId;
  let preview = "";
  let sourceId = targetId;

  if (contentType === "user") {
    // targetId = la personne concernée ; la « source » est l'auteur de l'action
    recipientId = targetId;
    sourceId = user.id;
  } else {
    const content = await loadContent(admin, contentType, targetId);
    if (!content?.authorId) {
      return { status: 404, body: { ok: false, error: "Contenu introuvable" } };
    }
    recipientId = content.authorId;
    preview = content.preview;
  }

  // Jamais de notification à soi-même
  if (recipientId === user.id) {
    return {
      status: 200,
      body: { ok: true, notified: false, reason: "self" },
    };
  }

  const happened = await interactionHappened(admin, {
    contentType,
    interactionType,
    actorId: user.id,
    targetId,
    recipientId,
  });
  if (!happened) {
    return {
      status: 409,
      body: { ok: false, error: "Interaction non constatée" },
    };
  }

  // Pas de doublon pour like / demande d'ami (les commentaires et partages peuvent se répéter).
  // Pour les demandes d'ami, seule une notification très récente compte comme doublon,
  // afin qu'une nouvelle demande, plus tard, soit bien notifiée.
  if (interactionType !== "comment" && interactionType !== "share") {
    let dupQuery = admin
      .from("notifications")
      .select("notification_id")
      .eq("user_id", recipientId)
      .eq("actor_id", user.id)
      .eq("type", rule.type)
      .eq("source_id", sourceId);
    if (contentType === "user") {
      dupQuery = dupQuery.gte(
        "created_at",
        new Date(Date.now() - 10 * 60_000).toISOString()
      );
    }
    const { data: dup } = await dupQuery.limit(1);
    if (dup?.length) {
      return {
        status: 200,
        body: { ok: true, notified: false, reason: "duplicate" },
      };
    }
  }

  await insertNotificationAndPush(admin, {
    recipientId,
    actorId: user.id,
    rule,
    sourceId,
    preview,
    contentType,
    targetId,
  });

  return { status: 200, body: { ok: true, notified: true } };
}

/**
 * action "comment" — utilisé par src/supabaseClient.js addComment().
 * Insère le commentaire côté serveur (identité = JWT) puis notifie l'auteur.
 */
async function handleComment(admin, user, body) {
  const text = sanitizeComment(body.text);
  if (!text) {
    return { status: 400, body: { ok: false, error: "Commentaire vide" } };
  }

  const postId = body.post_id;
  const videoId = body.video_id;

  if (postId && videoId) {
    return {
      status: 400,
      body: { ok: false, error: "Fournir post_id ou video_id, pas les deux" },
    };
  }

  if (isUuid(postId)) {
    const { data, error } = await admin
      .from("post_comments")
      .insert({
        post_id: postId,
        author_id: user.id,
        content: text,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[social] comment.post", error.message || error);
      return {
        status: 500,
        body: { ok: false, error: "Impossible d'enregistrer le commentaire" },
      };
    }

    const content = await loadContent(admin, "post", postId);
    if (content?.authorId && content.authorId !== user.id) {
      const rule = CONTENT_TYPES.post.comment;
      await insertNotificationAndPush(admin, {
        recipientId: content.authorId,
        actorId: user.id,
        rule,
        sourceId: postId,
        preview: clip(text, 120),
        contentType: "post",
        targetId: postId,
      }).catch((err) =>
        console.warn("[social] comment notify", err?.message || err)
      );
    }

    return { status: 200, body: { ok: true, comment_id: data?.id } };
  }

  if (isUuid(videoId)) {
    const { data, error } = await admin
      .from("video_comments")
      .insert({
        video_id: videoId,
        author_id: user.id,
        content: text,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[social] comment.video", error.message || error);
      return {
        status: 500,
        body: { ok: false, error: "Impossible d'enregistrer le commentaire" },
      };
    }

    const content = await loadContent(admin, "video", videoId);
    if (content?.authorId && content.authorId !== user.id) {
      const rule = CONTENT_TYPES.video.comment;
      await insertNotificationAndPush(admin, {
        recipientId: content.authorId,
        actorId: user.id,
        rule,
        sourceId: videoId,
        preview: clip(text, 120),
        contentType: "video",
        targetId: videoId,
      }).catch((err) =>
        console.warn("[social] comment notify", err?.message || err)
      );
    }

    return { status: 200, body: { ok: true, comment_id: data?.id } };
  }

  return {
    status: 400,
    body: { ok: false, error: "post_id ou video_id UUID requis" },
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée" });
  }

  const limiter = await rateLimitAsync(req, {
    key: "social-notify",
    max: 60,
    windowMs: 60_000,
  });
  if (!limiter.ok) {
    Object.entries(limiter.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
    return res.status(limiter.status).json(limiter.body);
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error("[social] config", error?.message || error);
    return res
      .status(500)
      .json({ ok: false, error: "Configuration serveur indisponible" });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (error) {
    return res
      .status(error.status || 401)
      .json({ ok: false, error: error.message || "Non authentifié" });
  }

  const body = req.body || {};
  const action = String(body.action || "").toLowerCase();

  try {
    if (action === "notify_interaction") {
      const result = await handleNotifyInteraction(admin, user, body);
      return res.status(result.status).json(result.body);
    }

    if (action === "comment") {
      const result = await handleComment(admin, user, body);
      return res.status(result.status).json(result.body);
    }

    return res.status(400).json({ ok: false, error: "Action inconnue" });
  } catch (error) {
    console.error("[social] handler", error?.message || error);
    return res
      .status(500)
      .json({ ok: false, error: "Notification impossible" });
  }
}
