/**
 * /api/social.js — VERSION COMPLÈTE CORRIGÉE
 *
 * 7-en-1 : notifications + comments + reactions + blocks + reports + follow + push
 * Identité : auth.users.id / profiles.id
 *
 * Corrections majeures :
 * - Messages notif avec NOM de l'acteur (plus de "a commencé à vous suivre" seul)
 * - Notif like / comment / follow claires
 * - Push Web + FCM via api/_lib/push.js (0 fichier racine api/ en plus)
 * - Liste notifications avec jointure actor (display_name, avatar)
 * - Catégorie social pour préférences push
 * - Pas de stockage média (texte / IDs uniquement)
 */

import {
  getAdminClient,
  requireUser,
  rateLimitAsync,
  applyCors,
} from "./_shared.js";

import { sendPushToUsers, processPushOutbox } from "./_lib/push.js";

function jsonError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

function isWorkerAuth(req) {
  const secret = process.env.BAARO_WORKER_SECRET || "";
  const h =
    req.headers["x-baaro-worker-secret"] ||
    req.headers["x-worker-secret"];
  return !!(secret && h && h === secret);
}

// ============================================================
// HELPERS NOTIFICATIONS SOCIALES
// ============================================================

async function getProfileLabel(admin, userId) {
  if (!userId) return "Quelqu'un";
  const { data } = await admin
    .from("profiles")
    .select("display_name, username, handle")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return "Quelqu'un";
  const name = (data.display_name || "").trim();
  if (name) return name;
  const u = (data.username || data.handle || "").trim();
  if (u) return u.startsWith("@") ? u : `@${u}`;
  return "Quelqu'un";
}

/**
 * Crée une notification in-app claire (+ push optionnel via outbox si dispo).
 */
async function createClearNotification(admin, {
  userId,
  actorId,
  type,
  sourceId = null,
  customMessage = null,
  push = true,
}) {
  if (!userId || !actorId || userId === actorId) return null;

  // Respect blocage
  const { data: blocked } = await admin
    .from("blocks")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", actorId)
    .maybeSingle();
  if (blocked) return null;

  const label = await getProfileLabel(admin, actorId);

  let message = customMessage;
  let pushTitle = "BAARO";
  let pushUrl = "/";

  if (!message) {
    switch (type) {
      case "follow":
        message = `${label} a commencé à vous suivre`;
        pushTitle = "Nouvel abonné";
        pushUrl = `/profile/${actorId}`;
        break;
      case "friend_request":
        message = `${label} vous a envoyé une demande d'ami`;
        pushTitle = "Demande d'ami";
        pushUrl = "/amis";
        break;
      case "friend_accepted":
        message = `${label} a accepté votre demande d'ami`;
        pushTitle = "Ami accepté";
        pushUrl = "/amis";
        break;
      case "like":
      case "reaction":
        message = `${label} a aimé votre publication`;
        pushTitle = "Nouveau j'aime";
        break;
      case "comment":
        message = `${label} a commenté votre publication`;
        pushTitle = "Nouveau commentaire";
        break;
      case "mention":
        message = `${label} vous a mentionné`;
        pushTitle = "Mention";
        break;
      default:
        message = `${label} a interagi avec vous`;
    }
  }

  message = String(message).slice(0, 240);

  const { data: row, error } = await admin
    .from("notifications")
    .insert({
      user_id: userId,
      actor_id: actorId,
      type: type || "social",
      message,
      source_id: sourceId,
      read: false,
    })
    .select("notification_id")
    .maybeSingle();

  if (error) {
    console.error("[social][createClearNotification]", error);
    return null;
  }

  // Push best-effort (préférences respectées dans sendPushToUsers)
  if (push) {
    try {
      await sendPushToUsers(admin, {
        userIds: [userId],
        title: pushTitle,
        body: message,
        url: pushUrl,
        category: "social",
        sound: "/sounds/baaro_pulse.mp3",
        data: {
          type,
          actor_id: actorId,
          notification_id: row?.notification_id,
          source_id: sourceId,
        },
      });
    } catch (e) {
      console.warn("[social][push]", e?.message || e);
    }
  }

  return row?.notification_id || null;
}

// ============================================================
// SYNC POST COMMENT COUNT
// ============================================================

async function handleSyncPostCommentCount({ admin, postId, res }) {
  if (!postId) {
    return jsonError(res, 400, "post_id requis");
  }

  const { count, error } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) {
    console.error("[social][sync_post_comment_count][count]", error);
    return jsonError(res, 500, error.message);
  }

  const nextCount = count ?? 0;

  const { error: updateError } = await admin
    .from("posts")
    .update({ comments_count: nextCount })
    .eq("id", postId);

  if (updateError) {
    console.error("[social][sync_post_comment_count][update]", updateError);
    return jsonError(res, 500, updateError.message);
  }

  return res.status(200).json({ ok: true, comments_count: nextCount });
}

// ============================================================
// SYNC VIDEO COMMENT COUNT
// ============================================================

async function handleSyncVideoCommentCount({ admin, videoId, res }) {
  if (!videoId) {
    return jsonError(res, 400, "video_id requis");
  }

  const { count, error } = await admin
    .from("video_comments")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId);

  if (error) {
    console.error("[social][sync_video_comment_count][count]", error);
    return jsonError(res, 500, error.message);
  }

  const nextCount = count ?? 0;

  const { error: updateError } = await admin
    .from("videos")
    .update({ comments_count: nextCount })
    .eq("id", videoId);

  if (updateError) {
    console.error("[social][sync_video_comment_count][update]", updateError);
    return jsonError(res, 500, updateError.message);
  }

  return res.status(200).json({ ok: true, comments_count: nextCount });
}

// ============================================================
// COMMENTS
// ============================================================

async function handleComment(admin, userId, body, res) {
  const { action, post_id, text, comment_id } = body || {};

  // DELETE
  if (action === "delete" || action === "delete_comment") {
    if (!comment_id) {
      return jsonError(res, 400, "comment_id requis");
    }

    const { data: existingComment, error: findError } = await admin
      .from("comments")
      .select("id, post_id, author_id")
      .eq("id", comment_id)
      .maybeSingle();

    if (findError) {
      return jsonError(res, 500, findError.message || "Impossible de trouver le commentaire");
    }
    if (!existingComment) {
      return jsonError(res, 404, "Commentaire introuvable");
    }
    if (existingComment.author_id !== userId) {
      return jsonError(res, 403, "Vous ne pouvez supprimer que vos propres commentaires");
    }

    const { error: deleteError } = await admin
      .from("comments")
      .delete()
      .eq("id", comment_id)
      .eq("author_id", userId);

    if (deleteError) {
      return jsonError(res, 500, deleteError.message || "Impossible de supprimer le commentaire");
    }

    await handleSyncPostCommentCount({
      admin,
      postId: existingComment.post_id,
      res: { status: () => ({ json: () => null }) },
    }).catch((err) => console.error("[social][delete_comment][count]", err));

    return res.status(200).json({
      ok: true,
      deleted: true,
      comment_id,
      post_id: existingComment.post_id,
    });
  }

  // LIST
  if (action === "list" || action === "list_comments") {
    if (!post_id) {
      return jsonError(res, 400, "post_id requis");
    }

    const { data, error } = await admin
      .from("comments")
      .select(`
        id,
        post_id,
        text,
        author_id,
        created_at,
        profiles:author_id (
          display_name,
          avatar_url,
          username
        )
      `)
      .eq("post_id", post_id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      return jsonError(res, 500, error.message || "Erreur chargement commentaires");
    }

    return res.status(200).json({ ok: true, comments: data || [] });
  }

  // CREATE
  const cleanText = String(text || "").trim();
  if (!post_id) return jsonError(res, 400, "post_id requis");
  if (!cleanText) return jsonError(res, 400, "text requis");
  if (cleanText.length > 1000) {
    return jsonError(res, 400, "Le commentaire ne peut pas dépasser 1000 caractères");
  }

  const { data: post, error: postError } = await admin
    .from("posts")
    .select("id, author_id, comments_count")
    .eq("id", post_id)
    .maybeSingle();

  if (postError) {
    return jsonError(res, 500, postError.message || "Impossible de vérifier le post");
  }
  if (!post) {
    return jsonError(res, 404, "Post introuvable");
  }

  const { data: comment, error: insertError } = await admin
    .from("comments")
    .insert({
      post_id,
      author_id: userId,
      text: cleanText,
    })
    .select("id, post_id, text, author_id, created_at")
    .single();

  if (insertError || !comment) {
    return jsonError(
      res,
      500,
      insertError?.message || "Impossible d'ajouter le commentaire"
    );
  }

  const { count: commentsCount, error: countError } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", post_id);

  const nextCount = countError
    ? Number(post.comments_count || 0) + 1
    : commentsCount ?? 0;

  await admin
    .from("posts")
    .update({ comments_count: nextCount })
    .eq("id", post_id);

  // Notification propriétaire — message AVEC nom
  if (post.author_id && post.author_id !== userId) {
    await createClearNotification(admin, {
      userId: post.author_id,
      actorId: userId,
      type: "comment",
      sourceId: post_id,
    });
  }

  return res.status(200).json({
    ok: true,
    comment,
    comments_count: nextCount,
  });
}

// ============================================================
// REACTIONS / LIKES
// ============================================================

async function handleReaction(admin, userId, body, res) {
  const { post_id, type, action } = body || {};

  if (!post_id) {
    return jsonError(res, 400, "post_id requis");
  }

  if (action === "unlike" || action === "remove") {
    await admin
      .from("post_reactions")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", userId);

    await admin
      .from("post_reactions")
      .delete()
      .eq("post_id", post_id)
      .eq("author_id", userId);

    return res.status(200).json({ ok: true, removed: true });
  }

  const t = type || "like";

  let { error } = await admin.from("post_reactions").upsert(
    {
      post_id,
      user_id: userId,
      reaction_type: t,
    },
    { onConflict: "post_id,user_id" }
  );

  if (error) {
    console.error("[social][reaction][user_id]", error);
    const fallback = await admin.from("post_reactions").upsert(
      {
        post_id,
        author_id: userId,
        reaction_type: t,
      },
      { onConflict: "post_id,author_id" }
    );
    if (fallback.error) {
      return jsonError(
        res,
        500,
        fallback.error.message || "Réaction impossible"
      );
    }
  }

  // Notifier l'auteur du post (avec nom)
  try {
    const { data: post } = await admin
      .from("posts")
      .select("author_id")
      .eq("id", post_id)
      .maybeSingle();

    if (post?.author_id && post.author_id !== userId) {
      await createClearNotification(admin, {
        userId: post.author_id,
        actorId: userId,
        type: t === "like" ? "like" : "reaction",
        sourceId: post_id,
      });
    }
  } catch (e) {
    console.warn("[social][reaction][notif]", e?.message || e);
  }

  return res.status(200).json({ ok: true, reacted: true, type: t });
}

// ============================================================
// FOLLOW / AMIS
// ============================================================

async function handleFollow(admin, userId, body, res) {
  const { action, target_id, is_friend } = body || {};

  if (!target_id) {
    return jsonError(res, 400, "target_id requis");
  }
  if (target_id === userId) {
    return jsonError(res, 400, "Action impossible sur soi-même");
  }

  // UNFOLLOW
  if (action === "unfollow" || action === "remove_follow") {
    await admin
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("followed_id", target_id);

    return res.status(200).json({ ok: true, unfollowed: true });
  }

  // FOLLOW (abonnement)
  if (action === "follow" || action === "subscribe") {
    const { error } = await admin.from("follows").upsert(
      {
        follower_id: userId,
        followed_id: target_id,
        status: "accepted",
        is_friend: false,
      },
      { onConflict: "follower_id,followed_id" }
    );

    if (error && error.code !== "23505") {
      return jsonError(res, 500, error.message || "Follow impossible");
    }

    // Notif claire (le trigger DB 023 peut aussi le faire — doublon évité côté client drawer)
    await createClearNotification(admin, {
      userId: target_id,
      actorId: userId,
      type: "follow",
    });

    return res.status(200).json({ ok: true, following: true });
  }

  // DEMANDE D'AMI
  if (action === "friend_request" || action === "add_friend") {
    const { error } = await admin.from("follows").upsert(
      {
        follower_id: userId,
        followed_id: target_id,
        status: "pending",
        is_friend: true,
      },
      { onConflict: "follower_id,followed_id" }
    );

    if (error && error.code !== "23505") {
      return jsonError(res, 500, error.message || "Demande impossible");
    }

    await createClearNotification(admin, {
      userId: target_id,
      actorId: userId,
      type: "friend_request",
    });

    return res.status(200).json({ ok: true, pending: true });
  }

  // ACCEPTER AMI
  if (action === "accept_friend") {
    // La demande a été envoyée par target_id vers userId
    const { error } = await admin
      .from("follows")
      .update({ status: "accepted", is_friend: true })
      .eq("follower_id", target_id)
      .eq("followed_id", userId)
      .eq("status", "pending");

    if (error) {
      return jsonError(res, 500, error.message || "Acceptation impossible");
    }

    // Notifier celui qui avait envoyé la demande
    await createClearNotification(admin, {
      userId: target_id,
      actorId: userId,
      type: "friend_accepted",
    });

    return res.status(200).json({ ok: true, friends: true });
  }

  // STATUS
  if (action === "follow_status" || action === "status") {
    const [{ data: sent }, { data: received }] = await Promise.all([
      admin
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", userId)
        .eq("followed_id", target_id)
        .maybeSingle(),
      admin
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", target_id)
        .eq("followed_id", userId)
        .maybeSingle(),
    ]);

    return res.status(200).json({
      ok: true,
      sent: sent || null,
      received: received || null,
    });
  }

  return jsonError(res, 400, "action follow invalide");
}

// ============================================================
// BLOCKS
// ============================================================

async function handleBlock(admin, userId, body, res) {
  const { blocked_id, action } = body || {};

  if (action === "list" || action === "list_blocks") {
    const { data, error } = await admin
      .from("blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", userId);

    if (error) return jsonError(res, 500, error.message);
    return res.status(200).json({ ok: true, blocks: data || [] });
  }

  if (!blocked_id) {
    return jsonError(res, 400, "blocked_id requis");
  }
  if (blocked_id === userId) {
    return jsonError(res, 400, "Tu ne peux pas te bloquer");
  }

  if (action === "unblock") {
    await admin
      .from("blocks")
      .delete()
      .eq("blocker_id", userId)
      .eq("blocked_id", blocked_id);

    return res.status(200).json({ ok: true, unblocked: true });
  }

  const { error } = await admin.from("blocks").insert({
    blocker_id: userId,
    blocked_id,
  });

  if (error && error.code !== "23505") {
    throw error;
  }

  return res.status(200).json({ ok: true, blocked: true });
}

// ============================================================
// REPORTS
// ============================================================

async function handleReport(admin, userId, body, res) {
  const { target_type, target_id, reason } = body || {};

  if (!target_type || !target_id) {
    return jsonError(res, 400, "target_type et target_id requis");
  }

  const { data, error } = await admin
    .from("reports")
    .insert({
      reporter_id: userId,
      target_type: String(target_type).slice(0, 50),
      target_id,
      reason: String(reason || "").slice(0, 500),
    })
    .select("id")
    .single();

  if (error) {
    return jsonError(res, 500, error.message);
  }

  return res.status(200).json({ ok: true, id: data?.id });
}

// ============================================================
// NOTIFICATIONS (list / read / delete / count)
// ============================================================

async function handleNotification(admin, userId, body, query, res) {
  const action = (body?.action || query?.action || "list").toLowerCase();
  const { id, notification_id } = body || {};
  const notificationId = notification_id || id;

  if (action === "unread_count" || action === "count") {
    const { count, error } = await admin
      .from("notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return jsonError(res, 500, error.message);
    return res.status(200).json({ ok: true, count: count || 0 });
  }

  if (action === "read_all") {
    const { error } = await admin
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return jsonError(res, 500, error.message);
    return res.status(200).json({ ok: true, read_all: true });
  }

  if ((action === "read" || action === "mark_read") && notificationId) {
    const { error } = await admin
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (error) return jsonError(res, 500, error.message);
    return res.status(200).json({ ok: true, read: true });
  }

  if (action === "delete" && notificationId) {
    const { error } = await admin
      .from("notifications")
      .delete()
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (error) return jsonError(res, 500, error.message);
    return res.status(200).json({ ok: true, deleted: true });
  }

  // LIST — avec profil acteur pour affichage clair
  const limit = Math.min(Number(query?.limit) || 30, 100);

  const { data, error } = await admin
    .from("notifications")
    .select(`
      notification_id,
      type,
      message,
      source_id,
      actor_id,
      read,
      read_at,
      created_at,
      actor:actor_id (
        display_name,
        username,
        handle,
        avatar_url
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return jsonError(res, 500, error.message);
  }

  // Enrichir message si ancien format sans nom
  const notifications = (data || []).map((n) => {
    const actor = n.actor;
    const label =
      actor?.display_name?.trim() ||
      (actor?.username ? `@${actor.username}` : null) ||
      (actor?.handle ? `@${actor.handle}` : null);

    let message = n.message || "";
    if (
      label &&
      (message === "a commencé à vous suivre" ||
        message === "a commenté ton post" ||
        message === "a aimé votre publication" ||
        !message)
    ) {
      if (n.type === "follow") message = `${label} a commencé à vous suivre`;
      else if (n.type === "comment") message = `${label} a commenté votre publication`;
      else if (n.type === "like" || n.type === "reaction") {
        message = `${label} a aimé votre publication`;
      } else if (n.type === "friend_request") {
        message = `${label} vous a envoyé une demande d'ami`;
      } else if (n.type === "friend_accepted") {
        message = `${label} a accepté votre demande d'ami`;
      } else if (!message) {
        message = `${label} a interagi avec vous`;
      }
    }

    return { ...n, message };
  });

  return res.status(200).json({ ok: true, notifications });
}

// ============================================================
// PUSH (via _lib/push.js — pas de nouveau fichier racine api/)
// ============================================================

async function handlePush(admin, user, body, req, res) {
  const action = String(body?.action || "").toLowerCase();

  if (action === "process_push_outbox") {
    if (!isWorkerAuth(req)) {
      return jsonError(res, 401, "Unauthorized");
    }
    const result = await processPushOutbox(admin, { batch: 40 });
    return res.status(result.ok ? 200 : 500).json(result);
  }

  if (action === "send_push") {
    const worker = isWorkerAuth(req);
    let userIds = Array.isArray(body?.user_ids) ? body.user_ids : [];

    if (!worker) {
      // Self-test uniquement
      userIds = [user.id];
    } else if (!userIds.length) {
      return jsonError(res, 400, "user_ids requis");
    }

    const result = await sendPushToUsers(admin, {
      userIds,
      title: body?.title,
      body: body?.body,
      url: body?.url,
      category: body?.category === "wallet" ? "earnings" : body?.category,
      tag: body?.tag,
      sound: body?.sound,
      data: body?.data,
    });

    return res.status(result.ok ? 200 : 400).json(result);
  }

  return jsonError(res, 400, "action push invalide");
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const limit = await rateLimitAsync(req, {
    key: "social",
    max: 80,
    windowMs: 60000,
  });

  if (!limit.ok) {
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  let user;

  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    // process_push_outbox peut être appelé en worker sans user JWT
    const actionEarly = String(
      req.body?.action || req.query?.action || ""
    ).toLowerCase();
    if (actionEarly === "process_push_outbox" && isWorkerAuth(req)) {
      try {
        admin = getAdminClient();
        const result = await processPushOutbox(admin, { batch: 40 });
        return res.status(result.ok ? 200 : 500).json(result);
      } catch (err) {
        return jsonError(res, 500, err.message || "Erreur outbox");
      }
    }
    return res.status(e.status || 401).json({
      ok: false,
      error: e.message,
    });
  }

  const action = String(
    req.body?.action || req.query?.action || ""
  ).toLowerCase();

  try {
    // --- Sync compteurs ---
    if (action === "sync_post_comment_count") {
      return await handleSyncPostCommentCount({
        admin,
        postId: req.body?.post_id,
        res,
      });
    }
    if (action === "sync_video_comment_count") {
      return await handleSyncVideoCommentCount({
        admin,
        videoId: req.body?.video_id,
        res,
      });
    }

    // --- Push ---
    if (action === "send_push" || action === "process_push_outbox") {
      return await handlePush(admin, user, req.body, req, res);
    }

    // --- Comments ---
    if (
      ["comment", "create_comment", "delete_comment", "list_comments"].includes(
        action
      )
    ) {
      return await handleComment(admin, user.id, req.body, res);
    }
    if (
      ["list", "delete"].includes(action) &&
      (req.body?.post_id || req.body?.comment_id)
    ) {
      return await handleComment(admin, user.id, req.body, res);
    }

    // --- Reactions ---
    if (
      ["like", "unlike", "reaction", "react"].includes(action) ||
      (req.body?.post_id && req.body?.type)
    ) {
      return await handleReaction(admin, user.id, req.body, res);
    }

    // --- Follow / amis ---
    if (
      [
        "follow",
        "unfollow",
        "subscribe",
        "remove_follow",
        "friend_request",
        "add_friend",
        "accept_friend",
        "follow_status",
        "status",
      ].includes(action)
    ) {
      return await handleFollow(admin, user.id, req.body, res);
    }

    // --- Blocks ---
    if (["block", "unblock", "list_blocks"].includes(action)) {
      return await handleBlock(admin, user.id, req.body, res);
    }

    // --- Reports ---
    if (action === "report") {
      return await handleReport(admin, user.id, req.body, res);
    }

    // --- Notifications (défaut) ---
    return await handleNotification(
      admin,
      user.id,
      req.body,
      req.query,
      res
    );
  } catch (e) {
    console.error("[social]", e);
    return jsonError(res, 500, e.message || "Erreur serveur social");
  }
}
