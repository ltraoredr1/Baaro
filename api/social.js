/**
 * /api/social — notifications d'interactions (like, commentaire, partage, repost,
 * abonnement, demande d'ami). Appelé par le client avec action = "notify_interaction".
 *
 * Le destinataire est TOUJOURS déterminé côté serveur (auteur du contenu), jamais
 * pris tel quel depuis le client. Chaque interaction est vérifiée quand c'est possible,
 * puis : 1) ligne dans `notifications` (liste dans l'appli), 2) push (FCM / Web Push).
 */
import { applyCors, getAdminClient, requireUser, rateLimit } from "./_shared.js";
import { sendPushToUsers } from "./_lib/push.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    follow: { type: "follow", verb: "a commencé à vous suivre" },
    friend_request: { type: "friend_request", verb: "vous a envoyé une demande d'ami" },
    friend_accepted: { type: "friend_accepted", verb: "a accepté votre demande d'ami" },
  },
};

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function loadContent(admin, contentType, id) {
  if (contentType === "post") {
    const { data } = await admin.from("posts").select("id, author_id, text").eq("id", id).maybeSingle();
    return data ? { authorId: data.author_id, preview: clip(data.text, 120) } : null;
  }
  const { data } = await admin
    .from("videos")
    .select("id, author_id, title, description")
    .eq("id", id)
    .maybeSingle();
  return data
    ? { authorId: data.author_id, preview: clip(data.title || data.description, 120) }
    : null;
}

// Vérifie que l'action a réellement eu lieu (anti-fausses notifications)
async function interactionHappened(admin, { contentType, interactionType, actorId, targetId, recipientId }) {
  if (contentType === "user") {
    const { data: sent } = await admin
      .from("follows")
      .select("status, is_friend")
      .eq("follower_id", actorId)
      .eq("followed_id", recipientId)
      .maybeSingle();
    if (interactionType === "follow") return sent?.status === "accepted";
    if (interactionType === "friend_request") return sent?.is_friend === true && sent?.status === "pending";
    if (interactionType === "friend_accepted") {
      if (sent?.is_friend === true && sent?.status === "accepted") return true;
      const { data: received } = await admin
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", recipientId)
        .eq("followed_id", actorId)
        .maybeSingle();
      return received?.is_friend === true && received?.status === "accepted";
    }
    return false;
  }

  if (interactionType === "like") {
    const table = contentType === "post" ? "post_likes" : "video_likes";
    const column = contentType === "post" ? "post_id" : "video_id";
    const { data } = await admin.from(table).select("user_id").eq(column, targetId).eq("user_id", actorId).maybeSingle();
    return !!data;
  }
  // commentaire / partage / repost : tables variables selon l'appli -> faite confiance + limitation de débit
  return true;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée" });
  }

  const limit = rateLimit(req, { key: "social-notify", max: 60, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error("[social] config", error);
    return res.status(500).json({ ok: false, error: "Configuration serveur indisponible" });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (error) {
    return res.status(error.status || 401).json({ ok: false, error: error.message });
  }

  const body = req.body || {};
  if (body.action !== "notify_interaction") {
    return res.status(400).json({ ok: false, error: "Action inconnue" });
  }

  const contentType = String(body.content_type || "").toLowerCase();
  const interactionType = String(body.interaction_type || "").toLowerCase();
  const rule = CONTENT_TYPES[contentType]?.[interactionType];
  if (!rule) {
    return res.status(400).json({ ok: false, error: "Type d'interaction invalide" });
  }

  const targetId = String(body.target_id || body.content_id || body.recipient_id || "");
  if (!targetId || (contentType === "user" && !UUID_RE.test(targetId))) {
    return res.status(400).json({ ok: false, error: "Cible invalide" });
  }

  try {
    let recipientId;
    let preview = "";
    let sourceId = targetId;

    if (contentType === "user") {
      recipientId = targetId;
      sourceId = user.id;
    } else {
      const content = await loadContent(admin, contentType, targetId);
      if (!content?.authorId) {
        return res.status(404).json({ ok: false, error: "Contenu introuvable" });
      }
      recipientId = content.authorId;
      preview = content.preview;
    }

    // Jamais de notification à soi-même
    if (recipientId === user.id) {
      return res.status(200).json({ ok: true, notified: false, reason: "self" });
    }

    const happened = await interactionHappened(admin, {
      contentType,
      interactionType,
      actorId: user.id,
      targetId,
      recipientId,
    });
    if (!happened) {
      return res.status(409).json({ ok: false, error: "Interaction non constatée" });
    }

    // Pas de doublon pour like / abonnement / demande (les commentaires peuvent se répéter)
    if (interactionType !== "comment" && interactionType !== "share") {
      const { data: dup } = await admin
        .from("notifications")
        .select("notification_id")
        .eq("user_id", recipientId)
        .eq("actor_id", user.id)
        .eq("type", rule.type)
        .eq("source_id", sourceId)
        .limit(1);
      if (dup?.length) {
        return res.status(200).json({ ok: true, notified: false, reason: "duplicate" });
      }
    }

    const { data: actor } = await admin
      .from("profiles")
      .select("display_name, handle")
      .eq("id", user.id)
      .maybeSingle();
    const actorName =
      clip(actor?.display_name, 40) ||
      (actor?.handle ? `@${String(actor.handle).replace(/^@/, "")}` : "Quelqu'un");

    const row = {
      user_id: recipientId,
      actor_id: user.id,
      type: rule.type,
      source_id: sourceId,
      message: `${actorName} ${rule.verb}`,
    };

    // `preview` est facultatif : si la colonne n'existe pas encore, on réessaie sans.
    let insert = await admin.from("notifications").insert({ ...row, preview: preview || null });
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
      tag: `social-${rule.type}-${sourceId}`,
      data: { type: rule.type, source_id: sourceId, actor_id: user.id },
    }).catch((err) => console.warn("[social] push", err?.message || err));

    return res.status(200).json({ ok: true, notified: true });
  } catch (error) {
    console.error("[social] notify_interaction", error);
    return res.status(500).json({ ok: false, error: "Notification impossible", details: error?.message });
  }
}
