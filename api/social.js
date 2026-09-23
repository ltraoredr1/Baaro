/**
 * /api/social.js - VERSION FINALE À JOUR
 * 6-en-1 : notifications + comments + reactions + blocks + reports + stories
 * Reste à 7/12 endpoints
 * Racine: auth.users.id
 */

import { getAdminClient, requireUser, rateLimitAsync, applyCors } from "./_shared.js";

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

// --- COMMENTS ---
async function handleComment(admin, userId, body, res) {
  const { action, post_id, text, comment_id } = body || {};
  if (action === "delete" || action === "delete_comment") {
    if (!comment_id) return jsonError(res, 400, "comment_id requis");
    await admin.from("comments").delete().eq("id", comment_id).eq("author_id", userId);
    return res.status(200).json({ ok: true, deleted: true });
  }
  if (action === "list" || action === "list_comments") {
    if (!post_id) return jsonError(res, 400, "post_id requis");
    const { data } = await admin.from("comments")
      .select("id, text, author_id, created_at, profiles:author_id(display_name, avatar_url)")
      .eq("post_id", post_id).order("created_at", { ascending: true }).limit(100);
    return res.status(200).json({ ok: true, comments: data || [] });
  }
  if (!post_id || !text?.trim()) return jsonError(res, 400, "post_id et text requis");
  const { data: comment } = await admin.from("comments").insert({
    post_id, author_id: userId, text: text.trim().slice(0, 1000),
  }).select("id, post_id, text, author_id, created_at").single();

  // Notif auto owner post
  try {
    const { data: post } = await admin.from("posts").select("author_id").eq("id", post_id).single();
    if (post && post.author_id !== userId) {
      const { data: blocked } = await admin.from("blocks")
        .select("id").eq("blocker_id", post.author_id).eq("blocked_id", userId).maybeSingle();
      if (!blocked) {
        await admin.from("notifications").insert({
          user_id: post.author_id, actor_id: userId,
          type: "comment", message: "a commenté ton post",
          target_id: post_id, target_type: "post",
        });
      }
    }
  } catch {}
  return res.status(200).json({ ok: true, comment });
}

// --- REACTIONS ---
async function handleReaction(admin, userId, body, res) {
  const { post_id, type, action } = body || {};
  if (!post_id) return jsonError(res, 400, "post_id requis");
  if (action === "unlike" || action === "remove") {
    await admin.from("post_reactions").delete().eq("post_id", post_id).eq("user_id", userId);
    // fallback si table avec author_id
    await admin.from("post_reactions").delete().eq("post_id", post_id).eq("author_id", userId);
    return res.status(200).json({ ok: true, removed: true });
  }
  const t = type || "like";
  let { error } = await admin.from("post_reactions").upsert(
    { post_id, user_id: userId, reaction_type: t },
    { onConflict: "post_id,user_id" }
  );
  if (error) {
    await admin.from("post_reactions").upsert(
      { post_id, author_id: userId, reaction_type: t },
      { onConflict: "post_id,author_id" }
    );
  }
  return res.status(200).json({ ok: true, reacted: true, type: t });
}

// --- BLOCKS ---
async function handleBlock(admin, userId, body, res) {
  const { blocked_id, action } = body || {};
  if (action === "list" || action === "list_blocks") {
    const { data } = await admin.from("blocks").select("blocked_id, created_at").eq("blocker_id", userId);
    return res.status(200).json({ ok: true, blocks: data || [] });
  }
  if (!blocked_id) return jsonError(res, 400, "blocked_id requis");
  if (blocked_id === userId) return jsonError(res, 400, "Tu ne peux pas te bloquer");
  if (action === "unblock") {
    await admin.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", blocked_id);
    return res.status(200).json({ ok: true, unblocked: true });
  }
  const { error } = await admin.from("blocks").insert({ blocker_id: userId, blocked_id });
  if (error && error.code !== "23505") throw error;
  return res.status(200).json({ ok: true, blocked: true });
}

// --- REPORTS ---
async function handleReport(admin, userId, body, res) {
  const { target_type, target_id, reason } = body || {};
  if (!target_type || !target_id) return jsonError(res, 400, "target_type et target_id requis");
  const { data } = await admin.from("reports").insert({
    reporter_id: userId, target_type: String(target_type).slice(0,50),
    target_id, reason: String(reason || "").slice(0,500),
  }).select("id").single();
  return res.status(200).json({ ok: true, id: data.id });
}

// --- STORIES ---
async function handleStory(admin, userId, body, res) {
  const { action, story_id, text, media_url } = body || {};
  if (action === "list" || action === "list_stories") {
    const { data: blocks } = await admin.from("blocks").select("blocked_id").eq("blocker_id", userId);
    const blockedIds = (blocks || []).map(b => b.blocked_id);
    let q = admin.from("stories").select("id, text, media_url, author_id, created_at, expires_at, profiles:author_id(display_name, avatar_url)")
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
    if (blockedIds.length) q = q.not("author_id", "in", `(${blockedIds.join(",")})`);
    const { data } = await q;
    return res.status(200).json({ ok: true, stories: data || [] });
  }
  if (action === "delete") {
    if (!story_id) return jsonError(res, 400, "story_id requis");
    await admin.from("stories").delete().eq("id", story_id).eq("author_id", userId);
    return res.status(200).json({ ok: true, deleted: true });
  }
  if (!text && !media_url) return jsonError(res, 400, "text ou media_url requis");
  const { data } = await admin.from("stories").insert({
    author_id: userId, text: String(text || "").slice(0,500),
    media_url: media_url || null,
    expires_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
  }).select("id, text, media_url, created_at, expires_at").single();
  return res.status(200).json({ ok: true, story: data });
}

// --- NOTIFICATIONS (mis à jour) ---
async function handleNotification(admin, userId, body, query, res) {
  const action = (body?.action || query?.action || "list").toLowerCase();
  const { id } = body || {};

  if (action === "unread_count" || action === "count") {
    const { count } = await admin.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("read", false);
    return res.status(200).json({ ok: true, count: count || 0 });
  }
  if (action === "read_all") {
    await admin.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    return res.status(200).json({ ok: true, read_all: true });
  }
  if ((action === "read" || action === "mark_read") && id) {
    await admin.from("notifications").update({ read: true }).eq("id", id).eq("user_id", userId);
    return res.status(200).json({ ok: true, read: true });
  }
  if (action === "delete" && id) {
    await admin.from("notifications").delete().eq("id", id).eq("user_id", userId);
    return res.status(200).json({ ok: true, deleted: true });
  }

  // LIST
  const limit = Math.min(Number(query?.limit) || 30, 100);
  const { data } = await admin.from("notifications")
    .select("id, type, message, target_id, target_type, actor_id, read, created_at, actor:actor_id(display_name, avatar_url)")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return res.status(200).json({ ok: true, notifications: data || [] });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === "OPTIONS") return res.status(200).end();

  const limit = await rateLimitAsync(req, { key: "social", max: 60, windowMs: 60000 });
  if (!limit.ok) return res.status(limit.status).json(limit.body);

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return res.status(e.status || 401).json({ ok: false, error: e.message });
  }

  const action = String(req.body?.action || req.query?.action || "").toLowerCase();

  try {
    if (["comment","create_comment","delete_comment","list_comments","list","delete"].includes(action) && (req.body?.post_id || req.body?.comment_id || action.includes("comment") || req.body?.text)) {
      if (action.startsWith("comment") || action.includes("comment") || req.body?.text) return await handleComment(admin, user.id, req.body, res);
    }
    if (["like","unlike","reaction","react"].includes(action) || (req.body?.post_id && req.body?.type)) {
      return await handleReaction(admin, user.id, req.body, res);
    }
    if (["block","unblock","list_blocks"].includes(action)) {
      return await handleBlock(admin, user.id, req.body, res);
    }
    if (["report"].includes(action)) {
      return await handleReport(admin, user.id, req.body, res);
    }
    if (["story","create_story","delete_story","list_stories"].includes(action)) {
      return await handleStory(admin, user.id, req.body, res);
    }
    // NOTIFICATIONS par défaut
    return await handleNotification(admin, user.id, req.body, req.query, res);

  } catch (e) {
    console.error("[social]", e);
    return jsonError(res, 500, e.message || "Erreur serveur social");
  }
}
