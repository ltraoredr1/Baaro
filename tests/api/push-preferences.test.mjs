import test from "node:test";
import assert from "node:assert/strict";
import {
  loadPrefs,
  selectNotificationTargets,
} from "../../api/_lib/push-preferences.js";

const userIds = ["user-identifier-001"];
const token = {
  id: "token-1",
  user_id: userIds[0],
  token: "push-token",
  platform: "android",
};

function createAdmin(result) {
  return {
    from(table) {
      assert.equal(table, "notification_preferences");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            in(column, requestedIds) {
              assert.equal(column, "user_id");
              assert.deepEqual(requestedIds, userIds);
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
}

test("une erreur Supabase reste distincte d'une absence de préférences", async () => {
  const error = { message: "database unavailable" };
  const prefsResult = await loadPrefs(
    createAdmin({ data: null, error }),
    userIds,
  );

  assert.equal(prefsResult.error, error);
  assert.equal(prefsResult.preferences.size, 0);

  const selection = selectNotificationTargets({
    userIds,
    prefsResult,
    tokensByUser: new Map([[userIds[0], [token]]]),
    category: "social",
  });
  assert.deepEqual(selection.targets, []);
  assert.equal(selection.skipped, userIds.length);
  assert.equal(selection.error, error);
});

test("une exception pendant la lecture bloque aussi toutes les catégories", async () => {
  const error = new Error("connection lost");
  const admin = {
    from() {
      return {
        select() {
          return {
            in() {
              throw error;
            },
          };
        },
      };
    },
  };
  const prefsResult = await loadPrefs(admin, userIds);

  assert.equal(prefsResult.error, error);
  for (const category of ["message", "social", "live", "earnings", "marketing"]) {
    const selection = selectNotificationTargets({
      userIds,
      prefsResult,
      tokensByUser: new Map([[userIds[0], [token]]]),
      category,
    });
    assert.deepEqual(selection.targets, [], `${category} doit être bloquée`);
  }
});

test("une lecture réussie sans ligne n'est pas une erreur et marketing reste opt-in", async () => {
  const prefsResult = await loadPrefs(
    createAdmin({ data: [], error: null }),
    userIds,
  );
  const tokensByUser = new Map([[userIds[0], [token]]]);

  assert.equal(prefsResult.error, null);
  assert.equal(prefsResult.preferences.has(userIds[0]), false);

  const social = selectNotificationTargets({
    userIds,
    prefsResult,
    tokensByUser,
    category: "social",
  });
  assert.deepEqual(social.targets, [token]);

  const marketing = selectNotificationTargets({
    userIds,
    prefsResult,
    tokensByUser,
    category: "marketing",
  });
  assert.deepEqual(marketing.targets, []);
  assert.equal(marketing.skipped, 1);
});

test("une préférence de catégorie désactivée continue à bloquer son envoi", async () => {
  const prefsResult = await loadPrefs(
    createAdmin({
      data: [{ user_id: userIds[0], messages: false, marketing: false }],
      error: null,
    }),
    userIds,
  );
  const tokensByUser = new Map([[userIds[0], [token]]]);

  for (const category of ["message", "marketing"]) {
    const selection = selectNotificationTargets({
      userIds,
      prefsResult,
      tokensByUser,
      category,
    });
    assert.deepEqual(selection.targets, [], `${category} doit être bloquée`);
  }
});
