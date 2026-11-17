import test from "node:test";
import assert from "node:assert/strict";
import { mergeLatestFeedRows } from "../../src/lib/feedState.js";
import { buildInteractionMap } from "../../src/lib/feedInteractionState.js";

test("fusionne les nouveaux posts en supprimant les doublons", () => {
  const previous = [{ id: "old" }, { id: "same", text: "ancienne version" }];
  const latest = [{ id: "new" }, { id: "same", text: "version récente" }];
  assert.deepEqual(mergeLatestFeedRows(previous, latest), [
    { id: "new" },
    { id: "same", text: "version récente" },
    { id: "old" },
  ]);
});

test("construit un index groupé des likes, partages et favoris", () => {
  const map = buildInteractionMap({
    userId: "user-1",
    likes: [
      { post_id: "p1", user_id: "user-1" },
      { post_id: "p1", user_id: "user-2" },
      { post_id: "p2", user_id: "user-2" },
    ],
    shares: [{ post_id: "p1" }, { post_id: "p1" }, { post_id: "p2" }],
    bookmarks: [{ post_id: "p2" }],
  });

  assert.deepEqual(map.get("p1"), {
    reactionCount: 2,
    reaction: "like",
    shareCount: 2,
    saved: false,
  });
  assert.deepEqual(map.get("p2"), {
    reactionCount: 1,
    reaction: null,
    shareCount: 1,
    saved: true,
  });
});

test("ignore les lignes d’interaction sans post_id", () => {
  const map = buildInteractionMap({ likes: [{ user_id: "user-1" }], shares: [{}] });
  assert.equal(map.size, 0);
});
