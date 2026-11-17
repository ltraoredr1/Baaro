import test from "node:test";
import assert from "node:assert/strict";
import { attachRepostCounts, mergeLatestFeedRows } from "../../src/lib/feedState.js";
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

test("recalcule les compteurs de repost depuis les lignes de post_reposts", () => {
  const rows = [
    { id: "p1", reposts_count: 99 },
    { id: "p2", reposts_count: 12 },
    { id: "p3" },
  ];
  const reposts = [
    { post_id: "p1" },
    { post_id: "p1" },
    { post_id: "p2" },
  ];
  assert.deepEqual(attachRepostCounts(rows, reposts), [
    { id: "p1", reposts_count: 2 },
    { id: "p2", reposts_count: 1 },
    { id: "p3", reposts_count: 0 },
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


test("construit les compteurs de partages agrégés sans compter une ligne comme un partage", () => {
  const map = buildInteractionMap({
    shares: [
      { post_id: "p1", share_count: 7 },
      { post_id: "p2", share_count: 0 },
    ],
  });

  assert.equal(map.get("p1").shareCount, 7);
  assert.equal(map.get("p2").shareCount, 0);
});
