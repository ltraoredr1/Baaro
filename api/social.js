
/**
 * /api/social.js — notifications + comments + reactions + blocks + reports + follow + push
 * Notifications d'interactions vidéo ajoutées sans créer une nouvelle API.
 */
import { getAdminClient, requireUser, rateLimitAsync, applyCors } from "./_shared.js";
import { sendPushToUsers } from "./_lib/push.js";

const POST_URL = (id) => (id ? `/post/${id}` : "/");
const PROFILE_URL = (id) => `/profile/${id}`;

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function isWorkerAuth(req) {
  const secret = process.env.BAARO_WORKER_SECRET || "";
  const h = req.headers["x-baaro-worker-secret"] || req.headers["x-worker-secret"];
  return !!(secret && h && h === secret);
}

// ============================================================
// NOTIFICATIONS — helpers
// ============================================================

function labelOf(p) {
  if (!p) return "Quelqu'un";
  const name = (p.display_name || "").trim();
  if (name) return name;
  const u = (p.username || p.handle || "").trim();
  if (u) return u.startsWith("@") ? u : `@${u}`;
  return "Quelqu'un";
}

async function getProfileLabel(admin, userId) {
  if (!userId) return "Quelqu'un";
  const { data } = await admin
    .from("profiles")
    .select("display_name, username, handle")
    .eq("id", userId)
    .maybeSingle();
  return labelOf(data);
}

function textFor(type, label) {
  switch (type) {
    case "follow":
      return { message: `${label} a commencé à vous suivre`, title: "Nouvel abonné" };
    case "friend_request":
      return { message: `${label} vous a envoyé une demande d'ami`, title: "Demande d'ami" };
    case "friend_accepted":
      return { message: `${label} a accepté votre demande d'ami`, title: "Ami accepté" };
    case "like":
    case "reaction":
      return { message: `${label} a aimé votre publication`, title: "Nouveau j'aime" };
    case "comment":
      return { message: `${label} a commenté votre publication`, title: "Nouveau commentaire" };
    case "mention":
      return { message: `${label} vous a mentionné`, title: "Mention" };
    case "video_like":
      return { message: `${label} a aimé votre vidéo`, title: "Vidéo aimée" };
    case "video_share":
      return { message: `${label} a partagé votre vidéo`, title: "Vidéo partagée" };
    case "video_repost":
      return { message: `${label} a reposté votre vidéo`, title: "Nouveau repost" };
    case "video_comment":
      return { message: `${label} a commenté votre vidéo`, title: "Commentaire vidéo" };
    case "story_reaction":
      return { message: `${label} a réagi à votre story`, title: "Réaction à votre story" };
    case "story_share":
      return { message: `${label} a partagé votre story`, title: "Story partagée" };
    case "post_share":
      return { message: `${label} a partagé votre publication`, title: "Publication partagée" };
    default:
      return { message: `${label} a interagi avec vous`, title: "BAARO" };
  }
}

function urlFor(type, actorId, sourceId) {
  switch (type) {
    case "follow":
      return PROFILE_URL(actorId);
    case "friend_request":
    case "friend_accepted":
      return "/amis";
    case "like":
    case "reaction":
    case "comment":
    case "mention":
      return POST_URL(sourceId);
    case "video_like":
    case "video_share":
    case "video_repost":
    case "video_comment":
      return sourceId ? `/?video=${encodeURIComponent(sourceId)}` : "/";
    default:
      return "/";
  }
}

/**
 * Crée une notification et, si demandé, une notification push.
 * Déduplique les notifications non-commentaires pendant 24 heures.
 */
async function createClearNotification(admin, {
  userId,
  actorId,
  type,
  sourceId = null,
  customMessage = null,
  push = true,
  forcePush = false,
}) {
  if (!userId || !actorId || userId === actorId) return null;

  const { data: blocked, error: blockError } = await admin
    .from("blocks")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", actorId)
    .maybeSingle();

  if (blockError) {
    console.error("[social][block-check]", blockError);
    return null;
  }
  if (blocked) return null;

  let existing = null;

  if (type !== "comment" && type !== "video_comment") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    let q = admin
      .from("notifications")
      .select("notification_id")
      .eq("user_id", userId)
      .eq("actor_id", actorId)
      .eq("type", type)
      .gte("created_at", since)
      .limit(1);

    q = sourceId ? q.eq("source_id", sourceId) : q.is("source_id", null);

    const { data, error } = await q.maybeSingle();

    if (error) {
      console.error("[social][notification-dedup]", error);
      return null;
    }

    existing = data || null;
  }

  const label = await getProfileLabel(admin, actorId);
  const t = textFor(type, label);
  const message = String(customMessage || t.message).slice(0, 240);

  let notificationId = existing?.notification_id || null;

  if (!existing) {
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

    notificationId = row?.notification_id || null;
  }

  if (push && (!existing || forcePush)) {
    try {
      await sendPushToUsers(admin, {
        userIds: [userId],
        title: t.title,
        body: message,
        url: urlFor(type, actorId, sourceId),
        category: "social",
        tag: `${type}:${sourceId || actorId}`,
        sound: "/sounds/baaro_pulse.mp3",
        data: {
          type,
          actor_id: actorId,
          notification_id: notificationId,
          source_id: sourceId,
        },
      });
    } catch (e) {
      console.warn("[social][push]", e?.message || e);
    }
  }

  return notificationId;
}

/**
 * Finalise la notification créée éventuellement par le trigger de follow.
 */
async function finalizeFollowNotification(admin, {
  userId,
  actorId,
  asRequest = false,
}) {
  if (!userId || !actorId || userId === actorId) return;

  const { data: blocked } = await admin
    .from("blocks")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", actorId)
    .maybeSingle();

  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: trig } = await admin
    .from("notifications")
    .select("notification_id")
    .eq("user_id", userId)
    .eq("actor_id", actorId)
    .eq("type", "follow")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (blocked) {
    if (trig) {
      await admin.from("notifications")
        .delete()
        .eq("notification_id", trig.notification_id);
    }
    return;
  }

  const label = await getProfileLabel(admin, actorId);
  const type = asRequest ? "friend_request" : "follow";
  const t = textFor(type, label);
  let notificationId = trig?.notification_id || null;

  if (trig) {
    await admin.from("notifications")
      .update({ type, message: t.message, source_id: actorId })
      .eq("notification_id", trig.notification_id);
  } else {
    const { data: row } = await admin.from("notifications")
      .insert({
        user_id: userId,
        actor_id: actorId,
        type,
        message: t.message,
        source_id: actorId,
        read: false,
      })
      .select("notification_id")
      .maybeSingle();

    notificationId = row?.notification_id || null;
  }

  try {
    await sendPushToUsers(admin, {
      userIds: [userId],
      title: t.title,
      body: t.message,
      url: urlFor(type, actorId, actorId),
      category: "social",
      tag: `${type}:${actorId}`,
      data: {
        type,
        actor_id: actorId,
        notification_id: notificationId,
        source_id: actorId,
      },
    });
  } catch (e) {
    console.warn("[social][follow push]", e?.message || e);
  }
}

async function removeNotifications(admin, {
  userId,
  actorId,
  types,
  sourceId,
}) {
  try {
    let q = admin.from("notifications")
      .delete()
      .eq("user_id", userId)
      .eq("actor_id", actorId)
      .in("type", types);

    if (sourceId) q = q.eq("source_id", sourceId);

    await q;
  } catch (e) {
    console.warn("[social][removeNotifications]", e?.message || e);
  }
}

// ============================================================
// SYNCHRONISATION DES COMPTEURS DE COMMENTAIRES
// ============================================================

async function syncCount(admin, { table, fk, id, parentTable }) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(fk, id);

  if (error) throw error;

  const next = count ?? 0;

  const { error: upErr } = await admin
    .from(parentTable)
    .update({ comments_count: next })
    .eq("id", id);

  if (upErr) throw upErr;

  return next;
}

async function handleSyncPostCommentCount({ admin, postId, res }) {
  if (!postId) return jsonError(res, 400, "post_id requis");

  try {
    const n = await syncCount(admin, {
      table: "comments",
      fk: "post_id",
      id: postId,
      parentTable: "posts",
    });

    return res.status(200).json({ ok: true, comments_count: n });
  } catch (e) {
    return jsonError(res, 500, e.message);
  }
}

async function handleSyncVideoCommentCount({ admin, videoId, res }) {
  if (!videoId) return jsonError(res, 400, "video_id requis");

  try {
    const n = await syncCount(admin, {
      table: "video_comments",
      fk: "video_id",
      id: videoId,
      parentTable: "videos",
    });

    return res.status(200).json({ ok: true, comments_count: n });
  } catch (e) {
    return jsonError(res, 500, e.message);
  }
}

// ============================================================
// COMMENTAIRES DE PUBLICATIONS
// ============================================================

async function handleComment(admin, userId, body, res) {
  const { action, post_id, text, comment_id } = body || {};

  if (action === "delete" || action === "delete_comment") {
    if (!comment_id) return jsonError(res, 400, "comment_id requis");

    const { data: existing, error: findError } = await admin
      .from("comments")
      .select("id, post_id, author_id")
      .eq("id", comment_id)
      .maybeSingle();

    if (findError) return jsonError(res, 500, findError.message);
    if (!existing) return jsonError(res, 404, "Commentaire introuvable");

    if (existing.author_id !== userId) {
      return jsonError(res, 403, "Vous ne pouvez supprimer que vos propres commentaires");
    }

    const { error: delError } = await admin.from("comments")
      .delete()
      .eq("id", comment_id)
      .eq("author_id", userId);

    if (delError) return jsonError(res, 500, delError.message);

    let count = null;

    try {
      count = await syncCount(admin, {
        table: "comments",
        fk: "post_id",
        id: existing.post_id,
        parentTable: "posts",
      });
    } catch (e) {
      console.error("[social][delete_comment][count]", e);
    }

    return res.status(200).json({
      ok: true,
      deleted: true,
      comment_id,
      post_id: existing.post_id,
      comments_count: count,
    });
  }

  if (action === "list" || action === "list_comments") {
    if (!post_id) return jsonError(res, 400, "post_id requis");

    const { data, error } = await admin
      .from("comments")
      .select("id, post_id, text, author_id, created_at, profiles:author_id ( display_name, avatar_url, username )")
      .eq("post_id", post_id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, comments: data || [] });
  }

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

  if (postError) return jsonError(res, 500, postError.message);
  if (!post) return jsonError(res, 404, "Post introuvable");

  const { data: comment, error: insertError } = await admin
    .from("comments")
    .insert({ post_id, author_id: userId, text: cleanText })
    .select("id, post_id, text, author_id, created_at")
    .single();

  if (insertError || !comment) {
    return jsonError(res, 500, insertError?.message || "Impossible d'ajouter le commentaire");
  }

  let nextCount;

  try {
    nextCount = await syncCount(admin, {
      table: "comments",
      fk: "post_id",
      id: post_id,
      parentTable: "posts",
    });
  } catch {
    nextCount = Number(post.comments_count || 0) + 1;
  }

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
// RÉACTIONS / LIKES DES PUBLICATIONS
// ============================================================

async function handleReaction(admin, userId, body, res) {
  const { post_id, type, action } = body || {};

  if (!post_id) return jsonError(res, 400, "post_id requis");

  if (action === "unlike" || action === "remove") {
    const { error: delUserError } = await admin.from("post_reactions")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", userId);

    const { error: delAuthorError } = await admin.from("post_reactions")
      .delete()
      .eq("post_id", post_id)
      .eq("author_id", userId);

    if (delUserError && delAuthorError) {
      return jsonError(res, 500, "Impossible de retirer la réaction");
    }

    try {
      const { data: post } = await admin.from("posts")
        .select("author_id")
        .eq("id", post_id)
        .maybeSingle();

      if (post?.author_id) {
        await removeNotifications(admin, {
          userId: post.author_id,
          actorId: userId,
          types: ["like", "reaction"],
          sourceId: post_id,
        });
      }
    } catch {}

    return res.status(200).json({ ok: true, removed: true });
  }

  const t = type || "like";
  let alreadyReacted = false;

  try {
    const { data: ex } = await admin.from("post_reactions")
      .select("post_id")
      .eq("post_id", post_id)
      .eq("user_id", userId)
      .maybeSingle();

    alreadyReacted = !!ex;
  } catch {}

  const { error } = await admin.from("post_reactions").upsert(
    { post_id, user_id: userId, reaction_type: t },
    { onConflict: "post_id,user_id" }
  );

  if (error) {
    console.error("[social][reaction][user_id]", error);

    const fallback = await admin.from("post_reactions").upsert(
      { post_id, author_id: userId, reaction_type: t },
      { onConflict: "post_id,author_id" }
    );

    if (fallback.error) {
      return jsonError(res, 500, fallback.error.message || "Réaction impossible");
    }
  }

  if (!alreadyReacted) {
    try {
      const { data: post } = await admin.from("posts")
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
  }

  return res.status(200).json({ ok: true, reacted: true, type: t });
}

// ============================================================
// FOLLOW / AMIS
// ============================================================

async function getFollow(admin, followerId, followedId) {
  const { data } = await admin.from("follows")
    .select("status, is_friend")
    .eq("follower_id", followerId)
    .eq("followed_id", followedId)
    .maybeSingle();

  return data || null;
}

async function handleFollow(admin, userId, body, res) {
  const { action, target_id } = body || {};

  if (!target_id) return jsonError(res, 400, "target_id requis");
  if (target_id === userId) return jsonError(res, 400, "Action impossible sur soi-même");

  if (action === "unfollow" || action === "remove_follow") {
    const { error } = await admin.from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("followed_id", target_id);

    if (error) return jsonError(res, 500, error.message);

    await removeNotifications(admin, {
      userId: target_id,
      actorId: userId,
      types: ["follow", "friend_request"],
    });

    return res.status(200).json({ ok: true, unfollowed: true });
  }

  if (action === "follow" || action === "subscribe") {
    const existing = await getFollow(admin, userId, target_id);

    if (existing) {
      return res.status(200).json({ ok: true, following: true, already: true });
    }

    const { error } = await admin.from("follows").insert({
      follower_id: userId,
      followed_id: target_id,
      status: "accepted",
      is_friend: false,
    });

    if (error && error.code !== "23505") {
      return jsonError(res, 500, error.message || "Follow impossible");
    }

    if (!error) {
      await finalizeFollowNotification(admin, { userId: target_id, actorId: userId });
    }

    return res.status(200).json({ ok: true, following: true });
  }

  if (action === "friend_request" || action === "add_friend") {
    const existing = await getFollow(admin, userId, target_id);

    if (existing?.is_friend && existing?.status === "accepted") {
      return res.status(200).json({ ok: true, friends: true, already: true });
    }

    if (existing?.status === "pending") {
      return res.status(200).json({ ok: true, pending: true, already: true });
    }

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

    if (!existing) {
      await finalizeFollowNotification(admin, {
        userId: target_id,
        actorId: userId,
        asRequest: true,
      });
    } else {
      await createClearNotification(admin, {
        userId: target_id,
        actorId: userId,
        type: "friend_request",
        sourceId: userId,
      });
    }

    return res.status(200).json({ ok: true, pending: true });
  }

  if (action === "accept_friend") {
    const { data: updated, error } = await admin.from("follows")
      .update({ status: "accepted", is_friend: true })
      .eq("follower_id", target_id)
      .eq("followed_id", userId)
      .eq("status", "pending")
      .select("follower_id");

    if (error) return jsonError(res, 500, error.message || "Acceptation impossible");
    if (!updated?.length) return jsonError(res, 404, "Aucune demande en attente");

    await createClearNotification(admin, {
      userId: target_id,
      actorId: userId,
      type: "friend_accepted",
    });

    return res.status(200).json({ ok: true, friends: true });
  }

  if (action === "follow_status" || action === "status") {
    const [sent, received] = await Promise.all([
      getFollow(admin, userId, target_id),
      getFollow(admin, target_id, userId),
    ]);

    return res.status(200).json({ ok: true, sent, received });
  }

  return jsonError(res, 400, "action follow invalide");
}

// ============================================================
// BLOCKS
// ============================================================

async function handleBlock(admin, userId, body, res) {
  const { blocked_id, action } = body || {};

  if (action === "list" || action === "list_blocks") {
    const { data, error } = await admin.from("blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", userId);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, blocks: data || [] });
  }

  if (!blocked_id) return jsonError(res, 400, "blocked_id requis");
  if (blocked_id === userId) return jsonError(res, 400, "Tu ne peux pas te bloquer");

  if (action === "unblock") {
    const { error } = await admin.from("blocks")
      .delete()
      .eq("blocker_id", userId)
      .eq("blocked_id", blocked_id);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, unblocked: true });
  }

  const { error } = await admin.from("blocks")
    .insert({ blocker_id: userId, blocked_id });

  if (error && error.code !== "23505") {
    return jsonError(res, 500, error.message);
  }

  return res.status(200).json({ ok: true, blocked: true });
}

// ============================================================
// SIGNALEMENTS
// ============================================================

async function handleReport(admin, userId, body, res) {
  const { target_type, target_id, reason } = body || {};

  if (!target_type || !target_id) {
    return jsonError(res, 400, "target_type et target_id requis");
  }

  const { data, error } = await admin.from("reports")
    .insert({
      reporter_id: userId,
      target_type: String(target_type).slice(0, 50),
      target_id,
      reason: String(reason || "").slice(0, 500),
    })
    .select("id")
    .single();

  if (error) return jsonError(res, 500, error.message);

  return res.status(200).json({ ok: true, id: data?.id });
}

// ============================================================
// NOTIFICATIONS : LIST / READ / DELETE / COUNT
// ============================================================

async function handleNotification(admin, userId, body, query, res) {
  const action = String(body?.action || query?.action || "list").toLowerCase();
  const notificationId = body?.notification_id || body?.id;

  if (action === "unread_count" || action === "count") {
    const { count, error } = await admin.from("notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, count: count || 0 });
  }

  if (action === "read_all") {
    const { error } = await admin.from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, read_all: true });
  }

  if ((action === "read" || action === "mark_read") && notificationId) {
    const { error } = await admin.from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, read: true });
  }

  if (action === "delete" && notificationId) {
    const { error } = await admin.from("notifications")
      .delete()
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (error) return jsonError(res, 500, error.message);

    return res.status(200).json({ ok: true, deleted: true });
  }

  const limit = Math.min(Number(body?.limit || query?.limit) || 30, 100);
  const before = body?.before || query?.before || null;

  let q = admin.from("notifications")
    .select("notification_id, type, message, source_id, actor_id, read, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;

  if (error) return jsonError(res, 500, error.message);

  const actorIds = [...new Set((data || []).map((n) => n.actor_id).filter(Boolean))];
  const profiles = new Map();

  if (actorIds.length) {
    const { data: profs } = await admin.from("profiles")
      .select("id, display_name, username, handle, avatar_url")
      .in("id", actorIds);

    for (const p of profs || []) profiles.set(p.id, p);
  }

  const notifications = (data || []).map((n) => {
    const actor = profiles.get(n.actor_id) || null;
    const message = n.message || textFor(n.type, labelOf(actor)).message;

    return {
      ...n,
      message,
      actor: actor
        ? {
            display_name: actor.display_name,
            username: actor.username,
            handle: actor.handle,
            avatar_url: actor.avatar_url,
          }
        : null,
    };
  });

  const last = notifications[notifications.length - 1];

  return res.status(200).json({
    ok: true,
    notifications,
    next_before: notifications.length === limit ? last?.created_at : null,
  });
}

// ============================================================
// PUSH
// ============================================================

async function handlePush(admin, user, body, req, res) {
  const action = String(body?.action || "").toLowerCase();
  const worker = isWorkerAuth(req);

  if (action !== "send_push") {
    return jsonError(res, 400, "action push invalide");
  }

  let userIds = Array.isArray(body?.user_ids) ? body.user_ids : [];

  if (!worker) {
    if (!user) return jsonError(res, 401, "Authentification manquante");
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

// ============================================================
// NOTIFICATIONS D'INTERACTIONS VIDÉO
// ============================================================

async function handleInteractionNotification(admin, userId, body, res) {
  const contentType = String(body?.content_type || "").toLowerCase();
  const interactionType = String(body?.interaction_type || "").toLowerCase();
  const contentId = body?.content_id;

  if (contentType !== "video") {
    return jsonError(res, 400, "Type de contenu non pris en charge");
  }

  const notificationTypes = {
    like: "video_like",
    share: "video_share",
    repost: "video_repost",
    comment: "video_comment",
  };

  const notificationType = notificationTypes[interactionType];

  if (!notificationType || !contentId) {
    return jsonError(res, 400, "Interaction ou contenu invalide");
  }

  const { data: video, error } = await admin.from("videos")
    .select("id, author_id")
    .eq("id", contentId)
    .maybeSingle();

  if (error) {
    console.error("[social][video-notification]", error);
    return jsonError(res, 500, "Impossible de vérifier la vidéo");
  }

  if (!video) return jsonError(res, 404, "Vidéo introuvable");

  if (!video.author_id || video.author_id === userId) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const notificationId = await createClearNotification(admin, {
    userId: video.author_id,
    actorId: userId,
    type: notificationType,
    sourceId: video.id,
  });

  return res.status(200).json({
    ok: true,
    notified: !!notificationId,
  });
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ipLimit = await rateLimitAsync(req, {
    key: "social-ip",
    max: 300,
    windowMs: 60000,
  });

  if (!ipLimit.ok) {
    if (ipLimit.headers) {
      for (const [k, v] of Object.entries(ipLimit.headers)) {
        res.setHeader(k, v);
      }
    }

    return res.status(ipLimit.status).json(ipLimit.body);
  }

  const action = String(req.body?.action || req.query?.action || "").toLowerCase();
  const isPushWorkerAction = action === "send_push" && isWorkerAuth(req);

  let admin;
  let user = null;

  try {
    admin = getAdminClient();

    if (!isPushWorkerAction) {
      user = await requireUser(req, admin);
    }
  } catch (e) {
    return res.status(e.status || 401).json({
      ok: false,
      error: e.message,
    });
  }

  if (user) {
    const userLimit = await rateLimitAsync(req, {
      key: `social-u-${user.id}`,
      max: 80,
      windowMs: 60000,
    });

    if (!userLimit.ok) {
      if (userLimit.headers) {
        for (const [k, v] of Object.entries(userLimit.headers)) {
          res.setHeader(k, v);
        }
      }

      return res.status(userLimit.status).json(userLimit.body);
    }
  }

  const body = req.body || {};

  try {
    if (action === "sync_post_comment_count") {
      return await handleSyncPostCommentCount({
        admin,
        postId: body.post_id,
        res,
      });
    }

    if (action === "sync_video_comment_count") {
      return await handleSyncVideoCommentCount({
        admin,
        videoId: body.video_id,
        res,
      });
    }

    if (action === "send_push") {
      return await handlePush(admin, user, body, req, res);
    }

    if (action === "notify_interaction") {
      return await handleInteractionNotification(admin, user.id, body, res);
    }

    if (["comment", "create_comment", "delete_comment", "list_comments"].includes(action)) {
      return await handleComment(admin, user.id, body, res);
    }

    if (["list", "delete"].includes(action) && (body.post_id || body.comment_id)) {
      return await handleComment(admin, user.id, body, res);
    }

    if (["like", "unlike", "reaction", "react"].includes(action) || (body.post_id && body.type)) {
      return await handleReaction(admin, user.id, body, res);
    }

    if ([
      "follow",
      "unfollow",
      "subscribe",
      "remove_follow",
      "friend_request",
      "add_friend",
      "accept_friend",
      "follow_status",
      "status",
    ].includes(action)) {
      return await handleFollow(admin, user.id, body, res);
    }

    if (["block", "unblock", "list_blocks"].includes(action)) {
      return await handleBlock(admin, user.id, body, res);
    }

    if (action === "report") {
      return await handleReport(admin, user.id, body, res);
    }

    return await handleNotification(admin, user.id, body, req.query, res);
  } catch (e) {
    console.error("[social]", e);
    return jsonError(res, 500, e.message || "Erreur serveur social");
  }
}
