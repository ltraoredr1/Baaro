import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_IDEMPOTENCY_INDEX,
  buildInteractionNotificationKey,
  insertNotificationOnce,
  insertNotificationsOnce,
} from "../../api/_lib/notification-idempotency.js";
import { interactionHappened } from "../../api/_lib/notification-interactions.js";

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECIPIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EVENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/**
 * Faux client Supabase : enregistre chaque appel (table, opération, filtres,
 * charge utile) et renvoie ce que `handler(state)` retourne. L'objet est
 * « thenable » pour supporter `await admin.from(...).upsert(...).select(...)`.
 */
function createFakeAdmin(handler) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = {
        table,
        op: "select",
        filters: [],
        payload: null,
        options: null,
        columns: null,
      };
      calls.push(state);
      const resolve = () => Promise.resolve(handler(state));
      const query = {
        insert(row) {
          state.op = "insert";
          state.payload = row;
          return query;
        },
        upsert(rows, options) {
          state.op = "upsert";
          state.payload = rows;
          state.options = options;
          return query;
        },
        select(columns) {
          state.columns = columns;
          return query;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return query;
        },
        single: resolve,
        maybeSingle: resolve,
        then(onFulfilled, onRejected) {
          return resolve().then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
}

function queuedAdmin(responses) {
  const queue = [...responses];
  return createFakeAdmin(() => queue.shift());
}

const conflictError = () => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${NOTIFICATION_IDEMPOTENCY_INDEX}"`,
});

const missingPreviewError = () => ({
  message: 'column "preview" of relation "notifications" does not exist',
});

const baseRow = (extra = {}) => ({
  user_id: RECIPIENT,
  actor_id: ACTOR,
  type: "like",
  source_id: TARGET,
  idempotency_key: "k1",
  message: "Test",
  ...extra,
});

// ---------------------------------------------------------------------------
// buildInteractionNotificationKey
// ---------------------------------------------------------------------------

test("la clé d'interaction est stable pour la même entrée", () => {
  const input = {
    type: "like",
    recipientId: RECIPIENT,
    actorId: ACTOR,
    sourceId: TARGET,
  };
  assert.equal(
    buildInteractionNotificationKey(input),
    buildInteractionNotificationKey({ ...input })
  );
});

test("la clé d'interaction assemble les parties dans l'ordre attendu", () => {
  assert.equal(
    buildInteractionNotificationKey({
      type: "like",
      recipientId: "r",
      actorId: "a",
      sourceId: "s",
      eventKey: "e",
    }),
    "interaction:like:r:a:s:e"
  );
});

test("la clé d'interaction traite les valeurs absentes comme des chaînes vides", () => {
  assert.equal(
    buildInteractionNotificationKey({
      type: "like",
      recipientId: "r",
      actorId: null,
      sourceId: undefined,
    }),
    "interaction:like:r:::"
  );
});

test("la clé d'interaction change dès que l'acteur, le type ou la source change", () => {
  const base = {
    type: "like",
    recipientId: RECIPIENT,
    actorId: ACTOR,
    sourceId: TARGET,
  };
  const key = buildInteractionNotificationKey(base);
  assert.notEqual(key, buildInteractionNotificationKey({ ...base, actorId: OTHER }));
  assert.notEqual(key, buildInteractionNotificationKey({ ...base, type: "comment" }));
  assert.notEqual(key, buildInteractionNotificationKey({ ...base, sourceId: OTHER }));
});

// ---------------------------------------------------------------------------
// insertNotificationOnce
// ---------------------------------------------------------------------------

test("insertNotificationOnce refuse une ligne sans idempotency_key", async () => {
  const admin = queuedAdmin([]);
  await assert.rejects(
    insertNotificationOnce(admin, { user_id: RECIPIENT }),
    TypeError
  );
  assert.equal(admin.calls.length, 0);
});

test("insertNotificationOnce insère la ligne et renvoie son identifiant", async () => {
  const admin = queuedAdmin([{ data: { notification_id: "n1" }, error: null }]);
  const result = await insertNotificationOnce(admin, baseRow());
  assert.deepEqual(result, { inserted: true, notificationId: "n1" });
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0].table, "notifications");
  assert.equal(admin.calls[0].op, "insert");
});

test("un conflit sur l'index d'idempotence est rapporté comme doublon", async () => {
  const admin = queuedAdmin([{ data: null, error: conflictError() }]);
  const result = await insertNotificationOnce(admin, baseRow());
  assert.deepEqual(result, { inserted: false, notificationId: null });
});

test("un conflit détecté via error.constraint est aussi un doublon", async () => {
  const admin = queuedAdmin([
    {
      data: null,
      error: { code: "23505", constraint: NOTIFICATION_IDEMPOTENCY_INDEX },
    },
  ]);
  const result = await insertNotificationOnce(admin, baseRow());
  assert.equal(result.inserted, false);
});

test("une violation d'unicité sur un autre index n'est pas avalée", async () => {
  const error = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "autre_index"',
  };
  const admin = queuedAdmin([{ data: null, error }]);
  await assert.rejects(insertNotificationOnce(admin, baseRow()), (err) => {
    assert.equal(err, error);
    return true;
  });
});

test("une erreur base de données quelconque est propagée", async () => {
  const error = { code: "XX000", message: "boom" };
  const admin = queuedAdmin([{ data: null, error }]);
  await assert.rejects(insertNotificationOnce(admin, baseRow()), (err) => {
    assert.equal(err, error);
    return true;
  });
});

test("sans colonne preview, l'insertion est rejouée sans ce champ", async () => {
  const admin = queuedAdmin([
    { data: null, error: missingPreviewError() },
    { data: { notification_id: "n2" }, error: null },
  ]);
  const result = await insertNotificationOnce(
    admin,
    baseRow({ preview: "aperçu" })
  );
  assert.deepEqual(result, { inserted: true, notificationId: "n2" });
  assert.equal(admin.calls.length, 2);
  assert.equal(admin.calls[0].payload.preview, "aperçu");
  assert.equal("preview" in admin.calls[1].payload, false);
  assert.equal(admin.calls[1].payload.idempotency_key, "k1");
});

test("après le repli sans preview, un doublon reste un doublon", async () => {
  const admin = queuedAdmin([
    { data: null, error: missingPreviewError() },
    { data: null, error: conflictError() },
  ]);
  const result = await insertNotificationOnce(
    admin,
    baseRow({ preview: "aperçu" })
  );
  assert.equal(result.inserted, false);
});

test("l'erreur preview n'est pas rejouée si la ligne n'a pas de preview", async () => {
  const error = missingPreviewError();
  const admin = queuedAdmin([{ data: null, error }]);
  await assert.rejects(insertNotificationOnce(admin, baseRow()), (err) => {
    assert.equal(err, error);
    return true;
  });
  assert.equal(admin.calls.length, 1);
});

// ---------------------------------------------------------------------------
// insertNotificationsOnce
// ---------------------------------------------------------------------------

test("insertNotificationsOnce renvoie [] pour une liste vide ou invalide", async () => {
  const admin = queuedAdmin([]);
  assert.deepEqual(await insertNotificationsOnce(admin, []), []);
  assert.deepEqual(await insertNotificationsOnce(admin, null), []);
  assert.equal(admin.calls.length, 0);
});

test("insertNotificationsOnce refuse une ligne sans idempotency_key", async () => {
  const admin = queuedAdmin([]);
  await assert.rejects(
    insertNotificationsOnce(admin, [baseRow(), { user_id: OTHER }]),
    TypeError
  );
  assert.equal(admin.calls.length, 0);
});

test("insertNotificationsOnce ignore les doublons via upsert ignoreDuplicates", async () => {
  const inserted = [{ notification_id: "n1", idempotency_key: "k1" }];
  const admin = queuedAdmin([{ data: inserted, error: null }]);
  const rows = [baseRow(), baseRow({ idempotency_key: "k2" })];

  const result = await insertNotificationsOnce(admin, rows);

  assert.deepEqual(result, inserted);
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0].op, "upsert");
  assert.deepEqual(admin.calls[0].options, {
    onConflict: "idempotency_key",
    ignoreDuplicates: true,
  });
  assert.deepEqual(admin.calls[0].payload, rows);
});

test("insertNotificationsOnce renvoie [] quand tout existe déjà", async () => {
  const admin = queuedAdmin([{ data: null, error: null }]);
  assert.deepEqual(await insertNotificationsOnce(admin, [baseRow()]), []);
});

test("insertNotificationsOnce rejoue sans preview si la colonne manque", async () => {
  const inserted = [{ notification_id: "n1", idempotency_key: "k1" }];
  const admin = queuedAdmin([
    { data: null, error: missingPreviewError() },
    { data: inserted, error: null },
  ]);

  const result = await insertNotificationsOnce(admin, [
    baseRow({ preview: "aperçu" }),
  ]);

  assert.deepEqual(result, inserted);
  assert.equal(admin.calls.length, 2);
  assert.equal(admin.calls[0].payload[0].preview, "aperçu");
  assert.equal("preview" in admin.calls[1].payload[0], false);
  assert.deepEqual(admin.calls[1].options, {
    onConflict: "idempotency_key",
    ignoreDuplicates: true,
  });
});

test("insertNotificationsOnce propage les autres erreurs", async () => {
  const error = { code: "XX000", message: "boom" };
  const admin = queuedAdmin([{ data: null, error }]);
  await assert.rejects(
    insertNotificationsOnce(admin, [baseRow()]),
    (err) => {
      assert.equal(err, error);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// interactionHappened
// ---------------------------------------------------------------------------

/** Client où le contenu (post/vidéo) appartient à `authorId`. */
function contentAdmin({ authorId = RECIPIENT, extra = {} } = {}) {
  return createFakeAdmin((state) => {
    if (state.table === "posts" || state.table === "videos") {
      return { data: { id: TARGET, author_id: authorId }, error: null };
    }
    if (state.table in extra) return extra[state.table];
    return { data: null, error: null };
  });
}

const found = (row) => ({ data: row, error: null });

const baseInteraction = (extra = {}) => ({
  contentType: "post",
  interactionType: "like",
  actorId: ACTOR,
  targetId: TARGET,
  recipientId: RECIPIENT,
  ...extra,
});

test("interactionHappened refuse sans client ou avec des identifiants invalides", async () => {
  const admin = contentAdmin();
  assert.equal(await interactionHappened(null, baseInteraction()), false);
  assert.equal(
    await interactionHappened(admin, baseInteraction({ actorId: "pas-un-uuid" })),
    false
  );
  assert.equal(
    await interactionHappened(admin, baseInteraction({ targetId: "" })),
    false
  );
  assert.equal(
    await interactionHappened(admin, baseInteraction({ recipientId: undefined })),
    false
  );
  assert.equal(admin.calls.length, 0);
});

test("interactionHappened refuse l'auto-notification", async () => {
  const admin = contentAdmin();
  assert.equal(
    await interactionHappened(admin, baseInteraction({ recipientId: ACTOR })),
    false
  );
  assert.equal(admin.calls.length, 0);
});

test("un like enregistré est constaté (post)", async () => {
  const admin = contentAdmin({ extra: { post_likes: found({ post_id: TARGET }) } });
  assert.equal(await interactionHappened(admin, baseInteraction()), true);

  const likeCall = admin.calls.find((c) => c.table === "post_likes");
  assert.ok(likeCall, "la table post_likes doit être interrogée");
  assert.deepEqual(likeCall.filters, [
    ["post_id", TARGET],
    ["user_id", ACTOR],
  ]);
});

test("un like enregistré est constaté (vidéo)", async () => {
  const admin = contentAdmin({ extra: { video_likes: found({ video_id: TARGET }) } });
  assert.equal(
    await interactionHappened(admin, baseInteraction({ contentType: "video" })),
    true
  );
  const likeCall = admin.calls.find((c) => c.table === "video_likes");
  assert.deepEqual(likeCall.filters, [
    ["video_id", TARGET],
    ["user_id", ACTOR],
  ]);
});

test("un like absent n'est pas constaté", async () => {
  const admin = contentAdmin();
  assert.equal(await interactionHappened(admin, baseInteraction()), false);
});

test("l'interaction est refusée si le destinataire n'est pas l'auteur du contenu", async () => {
  const admin = contentAdmin({
    authorId: OTHER,
    extra: { post_likes: found({ post_id: TARGET }) },
  });
  assert.equal(await interactionHappened(admin, baseInteraction()), false);
  assert.equal(
    admin.calls.some((c) => c.table === "post_likes"),
    false
  );
});

test("un commentaire exige un identifiant d'événement valide", async () => {
  const admin = contentAdmin();
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({ interactionType: "comment", eventId: "nope" })
    ),
    false
  );
  assert.equal(
    admin.calls.some((c) => c.table === "comments"),
    false
  );
});

test("un commentaire enregistré par l'acteur est constaté (post)", async () => {
  const admin = contentAdmin({ extra: { comments: found({ id: EVENT }) } });
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({ interactionType: "comment", eventId: EVENT })
    ),
    true
  );
  const call = admin.calls.find((c) => c.table === "comments");
  assert.deepEqual(call.filters, [
    ["id", EVENT],
    ["post_id", TARGET],
    ["author_id", ACTOR],
  ]);
});

test("un commentaire de vidéo utilise video_comments", async () => {
  const admin = contentAdmin({ extra: { video_comments: found({ id: EVENT }) } });
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({
        contentType: "video",
        interactionType: "comment",
        eventId: EVENT,
      })
    ),
    true
  );
  const call = admin.calls.find((c) => c.table === "video_comments");
  assert.deepEqual(call.filters, [
    ["id", EVENT],
    ["video_id", TARGET],
    ["author_id", ACTOR],
  ]);
});

test("partage et repost sont acceptés si le destinataire est bien l'auteur", async () => {
  for (const interactionType of ["share", "repost"]) {
    const ok = contentAdmin();
    assert.equal(
      await interactionHappened(ok, baseInteraction({ interactionType })),
      true
    );
    const wrongAuthor = contentAdmin({ authorId: OTHER });
    assert.equal(
      await interactionHappened(wrongAuthor, baseInteraction({ interactionType })),
      false
    );
  }
});

test("un type d'interaction inconnu est refusé", async () => {
  const admin = contentAdmin();
  assert.equal(
    await interactionHappened(admin, baseInteraction({ interactionType: "poke" })),
    false
  );
});

test("un type de contenu inconnu est refusé sans requête", async () => {
  const admin = contentAdmin();
  assert.equal(
    await interactionHappened(admin, baseInteraction({ contentType: "story" })),
    false
  );
  assert.equal(admin.calls.length, 0);
});

test("une demande d'ami en attente est constatée", async () => {
  const admin = createFakeAdmin(() => found({ follower_id: ACTOR }));
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({
        contentType: "user",
        interactionType: "friend_request",
        targetId: RECIPIENT,
      })
    ),
    true
  );
  assert.equal(admin.calls[0].table, "follows");
  assert.deepEqual(admin.calls[0].filters, [
    ["follower_id", ACTOR],
    ["followed_id", RECIPIENT],
    ["is_friend", true],
    ["status", "pending"],
  ]);
});

test("une acceptation d'ami inverse les rôles et exige le statut accepted", async () => {
  const admin = createFakeAdmin(() => found({ follower_id: RECIPIENT }));
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({
        contentType: "user",
        interactionType: "friend_accepted",
        targetId: RECIPIENT,
      })
    ),
    true
  );
  assert.deepEqual(admin.calls[0].filters, [
    ["follower_id", RECIPIENT],
    ["followed_id", ACTOR],
    ["is_friend", true],
    ["status", "accepted"],
  ]);
});

test("une interaction « user » dont la cible n'est pas le destinataire est refusée", async () => {
  const admin = createFakeAdmin(() => found({ follower_id: ACTOR }));
  assert.equal(
    await interactionHappened(
      admin,
      baseInteraction({
        contentType: "user",
        interactionType: "friend_request",
        targetId: TARGET,
      })
    ),
    false
  );
  assert.equal(admin.calls.length, 0);
});

test("une erreur de lecture renvoie false et est journalisée", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const admin = createFakeAdmin((state) =>
    state.table === "posts"
      ? { data: { id: TARGET, author_id: RECIPIENT }, error: null }
      : { data: null, error: { message: "db down" } }
  );
  assert.equal(await interactionHappened(admin, baseInteraction()), false);
  assert.equal(logged.mock.callCount(), 1);
});

test("une exception pendant la lecture du contenu renvoie false", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const admin = createFakeAdmin(() => {
    throw new Error("réseau coupé");
  });
  assert.equal(await interactionHappened(admin, baseInteraction()), false);
  assert.equal(logged.mock.callCount(), 1);
});
