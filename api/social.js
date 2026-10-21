/**
 * /api/social — notifications d'interactions sur les publications et vidéos
 * (like, commentaire, partage, repost). Appelé avec action = "notify_interaction".
 * + demandes d'ami (friend_request) et acceptations (friend_accepted).
 * + action "comment" : insertion serveur du commentaire + notification.
 * + actions "get_preferences" / "save_preferences" : préférences de notification
 *   de l'utilisateur connecté (table notification_preferences). Le client ne
 *   touche plus à cette table directement ; l'identité vient toujours du JWT.
 * + actions "save_push_token" / "delete_push_token" : jetons push de l'appareil
 *   (RPC upsert_push_token / table push_tokens), toujours pour l'utilisateur du JWT.
 * Les simples abonnements sont notifiés par le trigger SQL on_follow_created : pas géré ici.
 *
 * Le destinataire est TOUJOURS déterminé côté serveur (auteur du contenu), jamais
 * pris tel quel depuis le client. Chaque interaction est vérifiée quand c'est possible,
 * puis : 1) ligne dans `notifications` (liste dans l'appli), 2) push (FCM / Web Push).
 */
import { createClient } from "@supabase/supabase-js";
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
    // Ligne inverse : celle de l'autre personne vers l'acteur. Pour une demande
    // d'ami, si elle suivait déjà l'acteur, sendFriendRequest met à jour CETTE
    // ligne (is_friend + pending) au lieu d'en créer une nouvelle.
    const { data: received } = await admin
      .from("follows")
      .select("status, is_friend")
      .eq("follower_id", recipientId)
      .eq("followed_id", actorId)
      .maybeSingle();
    if (interactionType === "friend_request") {
      return (
        (sent?.is_friend === true && sent?.status === "pending") ||
        (received?.is_friend === true && received?.status === "pending")
      );
    }
    // friend_accepted : l'acceptation met à jour la ligne de la personne qui avait demandé
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
    tag: `social-${rule.type}-${sourceId}`,
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

  // ========== CORRIGÉ : table comments + colonne text ==========
  if (isUuid(postId)) {
    const { data, error } = await admin
      .from("comments")                    // ← était "post_comments"
      .insert({
        post_id: postId,
        author_id: user.id,
        text: text,                        // ← était "content"
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

  // Vidéo : inchangé (table video_comments + colonne content)
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

// ========== Préférences de notification ==========
const DEFAULT_PREFERENCES = {
  push_enabled: true,
  messages: true,
  social: true,
  live: true,
  earnings: true,
  marketing: false,
};
const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES);

// Ancienne colonne "wallet" → "earnings"
function normalizePreferences(row) {
  const source = row ? { ...row } : {};
  if (source.wallet !== undefined && source.earnings === undefined) {
    source.earnings = source.wallet;
  }
  const out = { ...DEFAULT_PREFERENCES };
  for (const key of PREFERENCE_KEYS) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  return out;
}

async function handleGetPreferences(admin, user) {
  const { data, error } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[social] get_preferences", error.message || error);
    return {
      status: 500,
      body: { ok: false, error: "Préférences indisponibles" },
    };
  }
  return {
    status: 200,
    body: { ok: true, data: { user_id: user.id, ...normalizePreferences(data) } },
  };
}

async function handleSavePreferences(admin, user, body) {
  const patch =
    body.preferences && typeof body.preferences === "object"
      ? body.preferences
      : body;

  const safe = {};
  for (const key of PREFERENCE_KEYS) {
    if (key in patch) safe[key] = Boolean(patch[key]);
  }
  if ("wallet" in patch && !("earnings" in safe)) {
    safe.earnings = Boolean(patch.wallet);
  }
  if (Object.keys(safe).length === 0) {
    return { status: 400, body: { ok: false, error: "Aucune préférence valide" } };
  }

  const { data, error } = await admin
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, ...safe, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[social] save_preferences", error.message || error);
    return {
      status: 500,
      body: { ok: false, error: "Impossible d'enregistrer les préférences" },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      data: { user_id: user.id, ...normalizePreferences(data || safe) },
    },
  };
}

// ========== Jetons push ==========
const PUSH_PLATFORMS = new Set(["web", "android", "ios"]);
const MAX_PUSH_TOKEN_LEN = 4096;

function cleanPushToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length <= MAX_PUSH_TOKEN_LEN ? token : "";
}

// Client Supabase au nom de l'utilisateur (JWT du client) : auth.uid() est alors
// renseigné pour les fonctions SQL qui le vérifient (ex. upsert_push_token).
function getUserClient(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const header = req.headers.authorization || "";
  if (!url || !anonKey || !header.startsWith("Bearer ")) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function handleSavePushToken(req, user, body) {
  const token = cleanPushToken(body.token);
  const platform = String(body.platform || "").toLowerCase();
  if (!token) {
    return { status: 400, body: { ok: false, error: "Jeton invalide" } };
  }
  if (!PUSH_PLATFORMS.has(platform)) {
    return { status: 400, body: { ok: false, error: "Plateforme invalide" } };
  }

  const userClient = getUserClient(req);
  if (!userClient) {
    console.error("[social] save_push_token : SUPABASE_ANON_KEY manquante");
    return {
      status: 500,
      body: { ok: false, error: "Configuration serveur incomplète" },
    };
  }

  const { error } = await userClient.rpc("upsert_push_token", {
    p_user_id: user.id,
    p_token: token,
    p_platform: platform,
    p_user_agent: clip(body.user_agent, 200) || null,
  });
  if (error) {
    console.error("[social] save_push_token", error.message || error);
    return {
      status: 500,
      body: { ok: false, error: "Impossible d'enregistrer le jeton" },
    };
  }
  return { status: 200, body: { ok: true } };
}

// Suppression : tous les jetons de la plateforme, ou un seul (token),
// ou tous sauf un (except_token, nettoyage des anciens jetons web).
async function handleDeletePushToken(admin, user, body) {
  const platform = String(body.platform || "").toLowerCase();
  if (!PUSH_PLATFORMS.has(platform)) {
    return { status: 400, body: { ok: false, error: "Plateforme invalide" } };
  }

  let query = admin
    .from("push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", platform);

  if (body.token !== undefined && body.token !== null) {
    const token = cleanPushToken(body.token);
    if (!token) {
      return { status: 400, body: { ok: false, error: "Jeton invalide" } };
    }
    query = query.eq("token", token);
  }
  if (body.except_token !== undefined && body.except_token !== null) {
    const exceptToken = cleanPushToken(body.except_token);
    if (!exceptToken) {
      return { status: 400, body: { ok: false, error: "Jeton invalide" } };
    }
    query = query.neq("token", exceptToken);
  }

  const { error } = await query;
  if (error) {
    console.error("[social] delete_push_token", error.message || error);
    return {
      status: 500,
      body: { ok: false, error: "Impossible de supprimer le jeton" },
    };
  }
  return { status: 200, body: { ok: true } };
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

    if (action === "get_preferences") {
      const result = await handleGetPreferences(admin, user);
      return res.status(result.status).json(result.body);
    }

    if (action === "save_preferences") {
      const result = await handleSavePreferences(admin, user, body);
      return res.status(result.status).json(result.body);
    }

    if (action === "save_push_token") {
      const result = await handleSavePushToken(req, user, body);
      return res.status(result.status).json(result.body);
    }

    if (action === "delete_push_token") {
      const result = await handleDeletePushToken(admin, user, body);
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
