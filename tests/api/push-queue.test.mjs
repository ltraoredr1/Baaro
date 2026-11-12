import test from "node:test";
import assert from "node:assert/strict";
import {
  enqueuePushNotifications,
  exponentialBackoffWithJitter,
  processPushQueue,
  PUSH_QUEUE_MAX_DELAY_MS,
} from "../../api/_lib/push-queue.js";

const tokenRow = {
  id: "token-1",
  user_id: "user-identifier-001",
  token: "secret-device-token",
  platform: "android",
};

function makeJob(overrides = {}) {
  return {
    id: "job-1",
    batch_id: "batch-1",
    user_id: tokenRow.user_id,
    token_id: tokenRow.id,
    payload: { title: "Hello", body: "World", category: "social" },
    status: "processing",
    attempts: 2,
    max_attempts: 8,
    claim_token: "claim-1",
    ...overrides,
  };
}

function makeAdmin({
  job = makeJob(),
  token = tokenRow,
  tokenError = null,
  preferences = [{ user_id: tokenRow.user_id, social: true }],
  preferenceError = null,
} = {}) {
  const state = { patches: [], archives: [], deletes: [], upserts: [] };
  const admin = {
    state,
    async rpc(name, args) {
      assert.equal(name, "claim_push_notification_jobs");
      assert.equal(args.p_limit, 40);
      return { data: [job], error: null };
    },
    from(table) {
      if (table === "notification_preferences") {
        return {
          select() {
            return {
              in(column, ids) {
                assert.equal(column, "user_id");
                assert.deepEqual(ids, [job.user_id]);
                return Promise.resolve({ data: preferences, error: preferenceError });
              },
            };
          },
        };
      }
      if (table === "push_tokens") {
        return {
          select() {
            const filters = {};
            const builder = {
              eq(column, value) {
                filters[column] = value;
                return this;
              },
              async maybeSingle() {
                assert.equal(filters.id, job.token_id);
                assert.equal(filters.user_id, job.user_id);
                return { data: token, error: tokenError };
              },
            };
            return builder;
          },
          delete() {
            const filters = {};
            const builder = {
              eq(column, value) {
                filters[column] = value;
                return this;
              },
              then(resolve, reject) {
                state.deletes.push({ table, filters });
                return Promise.resolve({ data: null, error: null }).then(resolve, reject);
              },
            };
            return builder;
          },
        };
      }
      if (table === "push_notification_jobs") {
        return {
          select() {
            const filters = {};
            return {
              eq(column, value) {
                filters[column] = value;
                const rows = state.upserts
                  .flatMap((item) => item.rows)
                  .filter((row) => row.batch_id === filters.batch_id);
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
          upsert(rows, options) {
            state.upserts.push({ table, rows, options });
            return Promise.resolve({ error: null });
          },
          update(patch) {
            const filters = {};
            const builder = {
              eq(column, value) {
                filters[column] = value;
                return this;
              },
              async select() {
                state.patches.push({ patch, filters });
                return { data: [{ id: job.id }], error: null };
              },
            };
            return builder;
          },
          delete() {
            const filters = {};
            const builder = {
              eq(column, value) {
                filters[column] = value;
                return this;
              },
              async select() {
                state.deletes.push({ table, filters });
                return { data: [{ id: job.id }], error: null };
              },
            };
            return builder;
          },
        };
      }
      if (table === "push_notification_dead_letters") {
        return {
          upsert(row, options) {
            state.archives.push({ row, options });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Table inattendue : ${table}`);
    },
  };
  return admin;
}

test("le backoff est exponentiel, jitterisé et plafonné", () => {
  assert.equal(exponentialBackoffWithJitter(1, () => 0), 2_500);
  assert.equal(exponentialBackoffWithJitter(1, () => 1), 5_000);
  assert.equal(exponentialBackoffWithJitter(2, () => 0), 5_000);
  assert.equal(exponentialBackoffWithJitter(99, () => 1), PUSH_QUEUE_MAX_DELAY_MS);
});

test("les cibles sont écrites durablement sans inclure le token push", async () => {
  const admin = makeAdmin();
  const result = await enqueuePushNotifications(
    admin,
    [tokenRow],
    { title: "Hello", body: "World" },
    "stable-batch",
  );

  assert.deepEqual(result, {
    ok: true,
    accepted: 1,
    queued: 1,
    sent: 0,
    deadLettered: 0,
    cancelled: 0,
  });
  const [insert] = admin.state.upserts;
  assert.equal(insert.table, "push_notification_jobs");
  assert.equal(insert.rows[0].batch_id, "stable-batch");
  assert.equal(insert.rows[0].token_id, tokenRow.id);
  assert.equal(insert.rows[0].user_id, tokenRow.user_id);
  assert.equal(insert.rows[0].status, "queued");
  assert.equal(insert.rows[0].attempts, 0);
  assert.equal("token" in insert.rows[0], false);
  assert.deepEqual(insert.options, {
    onConflict: "batch_id,token_id",
    ignoreDuplicates: true,
  });
});

test("un échec temporaire est replanifié avec son erreur et son délai", async () => {
  const admin = makeAdmin({ job: makeJob({ attempts: 2 }) });
  const result = await processPushQueue(
    admin,
    async () => ({ ok: false, error: "Firebase unavailable" }),
    { now: () => 100_000, random: () => 0 },
  );

  assert.equal(result.ok, true);
  assert.equal(result.claimed, 1);
  assert.equal(result.retryScheduled, 1);
  assert.equal(result.sent, 0);
  const [saved] = admin.state.patches;
  assert.equal(saved.patch.status, "queued");
  assert.equal(saved.patch.available_at, new Date(105_000).toISOString());
  assert.equal(saved.patch.last_error, "Firebase unavailable");
  assert.equal(saved.filters.claim_token, "claim-1");
});

test("les succès sont enregistrés comme envoyés", async () => {
  const admin = makeAdmin();
  const result = await processPushQueue(admin, async () => ({ ok: true }), {
    now: () => 100_000,
  });

  assert.equal(result.sent, 1);
  assert.equal(result.retryScheduled, 0);
  assert.equal(admin.state.patches[0].patch.status, "sent");
  assert.equal(admin.state.patches[0].patch.sent_at, new Date(100_000).toISOString());
});

test("un opt-out marketing intervenu après l'enqueue annule le job avant l'envoi", async () => {
  const admin = makeAdmin({
    job: makeJob({ payload: { title: "Hello", body: "World", category: "marketing" } }),
    preferences: [{ user_id: tokenRow.user_id, marketing: false }],
  });
  let sendCalls = 0;
  const result = await processPushQueue(admin, async () => {
    sendCalls += 1;
    return { ok: true };
  });

  assert.equal(result.cancelled, 1);
  assert.equal(result.sent, 0);
  assert.equal(sendCalls, 0);
  assert.equal(admin.state.patches[0].patch.status, "cancelled");
});

test("un jeton définitivement invalide est retiré et archivé dans la DLQ", async () => {
  const admin = makeAdmin({ job: makeJob({ attempts: 8 }) });
  const result = await processPushQueue(
    admin,
    async () => ({ ok: false, dead: true, error: "410" }),
  );

  assert.equal(result.deadLettered, 1);
  assert.equal(admin.state.archives.length, 1);
  assert.equal(admin.state.archives[0].row.source_job_id, "job-1");
  assert.equal(admin.state.archives[0].row.last_error, "410");
  assert.equal(admin.state.deletes.length, 1);
  assert.equal(admin.state.deletes[0].table, "push_tokens");
  assert.equal(admin.state.patches.at(-1).patch.status, "dead");
});

test("une erreur d’écriture du job n’est pas comptée comme succès", async () => {
  const admin = makeAdmin();
  admin.from = (table) => {
    if (table === "notification_preferences") {
      return {
        select: () => ({
          in: async () => ({
            data: [{ user_id: tokenRow.user_id, social: true }],
            error: null,
          }),
        }),
      };
    }
    if (table === "push_tokens") {
      return {
        select: () => ({
          eq() { return this; },
          async maybeSingle() { return { data: tokenRow, error: null }; },
        }),
      };
    }
    if (table === "push_notification_jobs") {
      return {
        update: () => ({
          eq() { return this; },
          async select() { return { data: null, error: { message: "write failed" } }; },
        }),
      };
    }
    throw new Error(`Table inattendue : ${table}`);
  };
  const result = await processPushQueue(admin, async () => ({ ok: true }));

  assert.equal(result.sent, 0);
  assert.equal(result.errors, 1);
});

test("l'envoi reçoit les préférences de l'utilisateur (son choisi)", async () => {
  const admin = makeAdmin({
    preferences: [
      {
        user_id: tokenRow.user_id,
        social: true,
        sound_id: "sahel_beat",
        sound_silent: false,
      },
    ],
  });
  let received = null;

  const result = await processPushQueue(
    admin,
    async (token, payload, context) => {
      received = { token, payload, context };
      return { ok: true };
    },
    { now: () => 100_000 },
  );

  assert.equal(result.sent, 1);
  assert.equal(received.token.id, tokenRow.id);
  assert.equal(received.context.preferences.sound_id, "sahel_beat");
  assert.equal(received.context.preferences.sound_silent, false);
});
