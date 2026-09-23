/**
 * /api/social.js - VERSION CORRIGÉE
 * 6-en-1 : notifications + comments + reactions + blocks + reports + stories
 * Racine identité : auth.users.id
 *
 * Corrections :
 * - commentaires contrôlés
 * - comments_count recalculé depuis la base
 * - synchronisation posts / commentaires
 * - synchronisation videos / video_comments
 * - notifications compatibles avec le schéma actuel
 */

import {
  getAdminClient,
  requireUser,
  rateLimitAsync,
  applyCors,
} from "./_shared.js";

function jsonError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

// ============================================================
// SYNC POST COMMENT COUNT
// ============================================================

async function handleSyncPostCommentCount({
  admin,
  postId,
  res,
}) {
  if (!postId) {
    return jsonError(res, 400, "post_id requis");
  }

  const { count, error } = await admin
    .from("comments")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("post_id", postId);

  if (error) {
    console.error(
      "[social][sync_post_comment_count][count]",
      error
    );

    return jsonError(res, 500, error.message);
  }

  const nextCount = count ?? 0;

  const { error: updateError } = await admin
    .from("posts")
    .update({
      comments_count: nextCount,
    })
    .eq("id", postId);

  if (updateError) {
    console.error(
      "[social][sync_post_comment_count][update]",
      updateError
    );

    return jsonError(res, 500, updateError.message);
  }

  return res.status(200).json({
    ok: true,
    comments_count: nextCount,
  });
}

// ============================================================
// SYNC VIDEO COMMENT COUNT
// ============================================================

async function handleSyncVideoCommentCount({
  admin,
  videoId,
  res,
}) {
  if (!videoId) {
    return jsonError(res, 400, "video_id requis");
  }

  const { count, error } = await admin
    .from("video_comments")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("video_id", videoId);

  if (error) {
    console.error(
      "[social][sync_video_comment_count][count]",
      error
    );

    return jsonError(res, 500, error.message);
  }

  const nextCount = count ?? 0;

  const { error: updateError } = await admin
    .from("videos")
    .update({
      comments_count: nextCount,
    })
    .eq("id", videoId);

  if (updateError) {
    console.error(
      "[social][sync_video_comment_count][update]",
      updateError
    );

    return jsonError(res, 500, updateError.message);
  }

  return res.status(200).json({
    ok: true,
    comments_count: nextCount,
  });
}

// ============================================================
// COMMENTS
// ============================================================

async function handleComment(admin, userId, body, res) {
  const {
    action,
    post_id,
    text,
    comment_id,
  } = body || {};

  // ----------------------------------------------------------
  // DELETE COMMENT
  // ----------------------------------------------------------

  if (
    action === "delete" ||
    action === "delete_comment"
  ) {
    if (!comment_id) {
      return jsonError(
        res,
        400,
        "comment_id requis"
      );
    }

    const {
      data: existingComment,
      error: findError,
    } = await admin
      .from("comments")
      .select(
        "id, post_id, author_id"
      )
      .eq("id", comment_id)
      .maybeSingle();

    if (findError) {
      console.error(
        "[social][delete_comment][find]",
        findError
      );

      return jsonError(
        res,
        500,
        findError.message ||
          "Impossible de trouver le commentaire"
      );
    }

    if (!existingComment) {
      return jsonError(
        res,
        404,
        "Commentaire introuvable"
      );
    }

    if (
      existingComment.author_id !== userId
    ) {
      return jsonError(
        res,
        403,
        "Vous ne pouvez supprimer que vos propres commentaires"
      );
    }

    const {
      error: deleteError,
    } = await admin
      .from("comments")
      .delete()
      .eq("id", comment_id)
      .eq("author_id", userId);

    if (deleteError) {
      console.error(
        "[social][delete_comment][delete]",
        deleteError
      );

      return jsonError(
        res,
        500,
        deleteError.message ||
          "Impossible de supprimer le commentaire"
      );
    }

    // Recalcul exact du compteur.
    // Cela évite les compteurs faux ou négatifs.
    await handleSyncPostCommentCount({
      admin,
      postId: existingComment.post_id,
      res: {
        status: () => ({
          json: () => null,
        }),
      },
    }).catch((error) => {
      console.error(
        "[social][delete_comment][count]",
        error
      );
    });

    return res.status(200).json({
      ok: true,
      deleted: true,
      comment_id,
      post_id: existingComment.post_id,
    });
  }

  // ----------------------------------------------------------
  // LIST COMMENTS
  // ----------------------------------------------------------

  if (
    action === "list" ||
    action === "list_comments"
  ) {
    if (!post_id) {
      return jsonError(
        res,
        400,
        "post_id requis"
      );
    }

    const {
      data,
      error,
    } = await admin
      .from("comments")
      .select(`
        id,
        post_id,
        text,
        author_id,
        created_at,
        profiles:author_id(
          display_name,
          avatar_url
        )
      `)
      .eq("post_id", post_id)
      .order("created_at", {
        ascending: true,
      })
      .limit(100);

    if (error) {
      console.error(
        "[social][list_comments]",
        error
      );

      return jsonError(
        res,
        500,
        error.message ||
          "Erreur chargement commentaires"
      );
    }

    return res.status(200).json({
      ok: true,
      comments: data || [],
    });
  }

  // ----------------------------------------------------------
  // CREATE COMMENT
  // ----------------------------------------------------------

  const cleanText = String(
    text || ""
  ).trim();

  if (!post_id) {
    return jsonError(
      res,
      400,
      "post_id requis"
    );
  }

  if (!cleanText) {
    return jsonError(
      res,
      400,
      "text requis"
    );
  }

  if (cleanText.length > 1000) {
    return jsonError(
      res,
      400,
      "Le commentaire ne peut pas dépasser 1000 caractères"
    );
  }

  const {
    data: post,
    error: postError,
  } = await admin
    .from("posts")
    .select(
      "id, author_id, comments_count"
    )
    .eq("id", post_id)
    .maybeSingle();

  if (postError) {
    console.error(
      "[social][comment][post]",
      postError
    );

    return jsonError(
      res,
      500,
      postError.message ||
        "Impossible de vérifier le post"
    );
  }

  if (!post) {
    return jsonError(
      res,
      404,
      "Post introuvable"
    );
  }

  // ----------------------------------------------------------
  // INSERT COMMENT
  // ----------------------------------------------------------

  const {
    data: comment,
    error: insertError,
  } = await admin
    .from("comments")
    .insert({
      post_id,
      author_id: userId,
      text: cleanText,
    })
    .select(`
      id,
      post_id,
      text,
      author_id,
      created_at
    `)
    .single();

  if (insertError) {
    console.error(
      "[social][comment][insert]",
      insertError
    );

    return jsonError(
      res,
      500,
      insertError.message ||
        "Impossible d'ajouter le commentaire"
    );
  }

  if (!comment) {
    return jsonError(
      res,
      500,
      "Le commentaire n'a pas pu être créé"
    );
  }

  // ----------------------------------------------------------
  // RECALCUL EXACT DU COMPTEUR
  // ----------------------------------------------------------

  const {
    count: commentsCount,
    error: countError,
  } = await admin
    .from("comments")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("post_id", post_id);

  if (countError) {
    console.error(
      "[social][comment][count]",
      countError
    );
  }

  const nextCount =
    countError
      ? Number(post.comments_count || 0) + 1
      : commentsCount ?? 0;

  const {
    error: updateCountError,
  } = await admin
    .from("posts")
    .update({
      comments_count: nextCount,
    })
    .eq("id", post_id);

  if (updateCountError) {
    console.error(
      "[social][comment][count-update]",
      updateCountError
    );
  }

  // ----------------------------------------------------------
  // NOTIFICATION DU PROPRIÉTAIRE
  // ----------------------------------------------------------

  try {
    if (
      post.author_id &&
      post.author_id !== userId
    ) {
      const {
        data: blocked,
      } = await admin
        .from("blocks")
        .select("id")
        .eq(
          "blocker_id",
          post.author_id
        )
        .eq(
          "blocked_id",
          userId
        )
        .maybeSingle();

      if (!blocked) {
        const {
          error: notificationError,
        } = await admin
          .from("notifications")
          .insert({
            user_id: post.author_id,
            actor_id: userId,
            type: "comment",
            message: "a commenté ton post",
            source_id: post_id,
          });

        if (notificationError) {
          console.error(
            "[social][comment][notification]",
            notificationError
          );
        }
      }
    }
  } catch (notificationError) {
    console.error(
      "[social][comment][notification]",
      notificationError
    );
  }

  return res.status(200).json({
    ok: true,
    comment,
    comments_count: nextCount,
  });
}

// ============================================================
// REACTIONS
// ============================================================

async function handleReaction(
  admin,
  userId,
  body,
  res
) {
  const {
    post_id,
    type,
    action,
  } = body || {};

  if (!post_id) {
    return jsonError(
      res,
      400,
      "post_id requis"
    );
  }

  if (
    action === "unlike" ||
    action === "remove"
  ) {
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

    return res.status(200).json({
      ok: true,
      removed: true,
    });
  }

  const t = type || "like";

  let {
    error,
  } = await admin
    .from("post_reactions")
    .upsert(
      {
        post_id,
        user_id: userId,
        reaction_type: t,
      },
      {
        onConflict:
          "post_id,user_id",
      }
    );

  if (error) {
    console.error(
      "[social][reaction][user_id]",
      error
    );

    const fallback =
      await admin
        .from("post_reactions")
        .upsert(
          {
            post_id,
            author_id: userId,
            reaction_type: t,
          },
          {
            onConflict:
              "post_id,author_id",
          }
        );

    if (fallback.error) {
      return jsonError(
        res,
        500,
        fallback.error.message ||
          "Réaction impossible"
      );
    }
  }

  return res.status(200).json({
    ok: true,
    reacted: true,
    type: t,
  });
}

// ============================================================
// BLOCKS
// ============================================================

async function handleBlock(
  admin,
  userId,
  body,
  res
) {
  const {
    blocked_id,
    action,
  } = body || {};

  if (
    action === "list" ||
    action === "list_blocks"
  ) {
    const {
      data,
      error,
    } = await admin
      .from("blocks")
      .select(
        "blocked_id, created_at"
      )
      .eq(
        "blocker_id",
        userId
      );

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      blocks: data || [],
    });
  }

  if (!blocked_id) {
    return jsonError(
      res,
      400,
      "blocked_id requis"
    );
  }

  if (blocked_id === userId) {
    return jsonError(
      res,
      400,
      "Tu ne peux pas te bloquer"
    );
  }

  if (action === "unblock") {
    await admin
      .from("blocks")
      .delete()
      .eq(
        "blocker_id",
        userId
      )
      .eq(
        "blocked_id",
        blocked_id
      );

    return res.status(200).json({
      ok: true,
      unblocked: true,
    });
  }

  const {
    error,
  } = await admin
    .from("blocks")
    .insert({
      blocker_id: userId,
      blocked_id,
    });

  if (
    error &&
    error.code !== "23505"
  ) {
    throw error;
  }

  return res.status(200).json({
    ok: true,
    blocked: true,
  });
}

// ============================================================
// REPORTS
// ============================================================

async function handleReport(
  admin,
  userId,
  body,
  res
) {
  const {
    target_type,
    target_id,
    reason,
  } = body || {};

  if (
    !target_type ||
    !target_id
  ) {
    return jsonError(
      res,
      400,
      "target_type et target_id requis"
    );
  }

  const {
    data,
    error,
  } = await admin
    .from("reports")
    .insert({
      reporter_id: userId,
      target_type: String(
        target_type
      ).slice(0, 50),
      target_id,
      reason: String(
        reason || ""
      ).slice(0, 500),
    })
    .select("id")
    .single();

  if (error) {
    return jsonError(
      res,
      500,
      error.message
    );
  }

  return res.status(200).json({
    ok: true,
    id: data?.id,
  });
}

// ============================================================
// STORIES
// ============================================================

async function handleStory(
  admin,
  userId,
  body,
  res
) {
  const {
    action,
    story_id,
    text,
    media_url,
  } = body || {};

  if (
    action === "list" ||
    action === "list_stories"
  ) {
    const {
      data: blocks,
    } = await admin
      .from("blocks")
      .select("blocked_id")
      .eq(
        "blocker_id",
        userId
      );

    const blockedIds =
      (blocks || []).map(
        (b) => b.blocked_id
      );

    let q = admin
      .from("stories")
      .select(`
        id,
        text,
        media_url,
        author_id,
        created_at,
        expires_at,
        profiles:author_id(
          display_name,
          avatar_url
        )
      `)
      .gt(
        "expires_at",
        new Date().toISOString()
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(50);

    if (blockedIds.length) {
      q = q.not(
        "author_id",
        "in",
        `(${blockedIds.join(",")})`
      );
    }

    const {
      data,
      error,
    } = await q;

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      stories: data || [],
    });
  }

  if (
    action === "delete" ||
    action === "delete_story"
  ) {
    if (!story_id) {
      return jsonError(
        res,
        400,
        "story_id requis"
      );
    }

    await admin
      .from("stories")
      .delete()
      .eq("id", story_id)
      .eq(
        "author_id",
        userId
      );

    return res.status(200).json({
      ok: true,
      deleted: true,
    });
  }

  if (!text && !media_url) {
    return jsonError(
      res,
      400,
      "text ou media_url requis"
    );
  }

  const {
    data,
    error,
  } = await admin
    .from("stories")
    .insert({
      author_id: userId,
      text: String(
        text || ""
      ).slice(0, 500),
      media_url:
        media_url || null,
      expires_at:
        new Date(
          Date.now() +
            24 * 60 * 60 * 1000
        ).toISOString(),
    })
    .select(
      "id, text, media_url, created_at, expires_at"
    )
    .single();

  if (error) {
    return jsonError(
      res,
      500,
      error.message
    );
  }

  return res.status(200).json({
    ok: true,
    story: data,
  });
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function handleNotification(
  admin,
  userId,
  body,
  query,
  res
) {
  const action = (
    body?.action ||
    query?.action ||
    "list"
  ).toLowerCase();

  const {
    id,
    notification_id,
  } = body || {};

  const notificationId =
    notification_id || id;

  // UNREAD COUNT
  if (
    action === "unread_count" ||
    action === "count"
  ) {
    const {
      count,
      error,
    } = await admin
      .from("notifications")
      .select(
        "notification_id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "read",
        false
      );

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      count: count || 0,
    });
  }

  // READ ALL
  if (action === "read_all") {
    const {
      error,
    } = await admin
      .from("notifications")
      .update({
        read: true,
        read_at:
          new Date().toISOString(),
      })
      .eq(
        "user_id",
        userId
      )
      .eq(
        "read",
        false
      );

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      read_all: true,
    });
  }

  // READ ONE
  if (
    (
      action === "read" ||
      action === "mark_read"
    ) &&
    notificationId
  ) {
    const {
      error,
    } = await admin
      .from("notifications")
      .update({
        read: true,
        read_at:
          new Date().toISOString(),
      })
      .eq(
        "notification_id",
        notificationId
      )
      .eq(
        "user_id",
        userId
      );

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      read: true,
    });
  }

  // DELETE
  if (
    action === "delete" &&
    notificationId
  ) {
    const {
      error,
    } = await admin
      .from("notifications")
      .delete()
      .eq(
        "notification_id",
        notificationId
      )
      .eq(
        "user_id",
        userId
      );

    if (error) {
      return jsonError(
        res,
        500,
        error.message
      );
    }

    return res.status(200).json({
      ok: true,
      deleted: true,
    });
  }

  // LIST
  const limit = Math.min(
    Number(query?.limit) || 30,
    100
  );

  const {
    data,
    error,
  } = await admin
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
      actor:actor_id(
        display_name,
        avatar_url
      )
    `)
    .eq(
      "user_id",
      userId
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(limit);

  if (error) {
    return jsonError(
      res,
      500,
      error.message
    );
  }

  return res.status(200).json({
    ok: true,
    notifications:
      data || [],
  });
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method === "OPTIONS") {
    return res
      .status(200)
      .end();
  }

  const limit =
    await rateLimitAsync(
      req,
      {
        key: "social",
        max: 60,
        windowMs: 60000,
      }
    );

  if (!limit.ok) {
    return res
      .status(limit.status)
      .json(limit.body);
  }

  let admin;
  let user;

  try {
    admin =
      getAdminClient();

    user =
      await requireUser(
        req,
        admin
      );
  } catch (e) {
    return res
      .status(
        e.status || 401
      )
      .json({
        ok: false,
        error: e.message,
      });
  }

  const action =
    String(
      req.body?.action ||
        req.query?.action ||
        ""
    ).toLowerCase();

  try {
    // ========================================================
    // SYNCHRONISATION COMPTEURS
    // ========================================================

    if (
      action ===
      "sync_post_comment_count"
    ) {
      return await handleSyncPostCommentCount(
        {
          admin,
          postId:
            req.body?.post_id,
          res,
        }
      );
    }

    if (
      action ===
      "sync_video_comment_count"
    ) {
      return await handleSyncVideoCommentCount(
        {
          admin,
          videoId:
            req.body?.video_id,
          res,
        }
      );
    }

    // ========================================================
    // COMMENTS
    // ========================================================

    if (
      [
        "comment",
        "create_comment",
        "delete_comment",
        "list_comments",
      ].includes(action)
    ) {
      return await handleComment(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // Compatibilité ancienne API
    if (
      ["list", "delete"].includes(
        action
      ) &&
      (
        req.body?.post_id ||
        req.body?.comment_id
      )
    ) {
      return await handleComment(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // ========================================================
    // REACTIONS
    // ========================================================

    if (
      [
        "like",
        "unlike",
        "reaction",
        "react",
      ].includes(action) ||
      (
        req.body?.post_id &&
        req.body?.type
      )
    ) {
      return await handleReaction(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // ========================================================
    // BLOCKS
    // ========================================================

    if (
      [
        "block",
        "unblock",
        "list_blocks",
      ].includes(action)
    ) {
      return await handleBlock(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // ========================================================
    // REPORTS
    // ========================================================

    if (
      action === "report"
    ) {
      return await handleReport(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // ========================================================
    // STORIES
    // ========================================================

    if (
      [
        "story",
        "create_story",
        "delete_story",
        "list_stories",
      ].includes(action)
    ) {
      return await handleStory(
        admin,
        user.id,
        req.body,
        res
      );
    }

    // ========================================================
    // NOTIFICATIONS
    // ========================================================

    return await handleNotification(
      admin,
      user.id,
      req.body,
      req.query,
      res
    );
  } catch (e) {
    console.error(
      "[social]",
      e
    );

    return jsonError(
      res,
      500,
      e.message ||
        "Erreur serveur social"
    );
  }
}
