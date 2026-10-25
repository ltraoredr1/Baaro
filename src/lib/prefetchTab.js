/**
 * Prefetch des chunks d'onglets au hover / touch / idle.
 * Place : src/lib/prefetchTab.js
 */
const loaders = {
  feed: () => import("../features/feed/index.js"),
  videos: () => import("../features/videos/index.js"),
  messages: () => import("../features/messaging/index.js"),
  friends: () => import("../features/friends/index.js"),
  debates: () => import("../features/debates/index.js"),
  offline: () => import("../features/offline/index.js"),
  assistant: () => import("../features/ai/index.js"),
  shop: () => import("../features/shop/index.js"),
  settings: () => import("../features/settings/index.tsx"),
  plus: () => import("../features/settings/index.tsx"),
  // Onglets ajoutés (mêmes chemins que src/app/tabs.jsx) :
  stories: () => import("../features/stories/StoriesTab.jsx"),
  discover: () => import("../components/DiscoverHub.jsx"),
  community: () => import("../components/CommunityTab.jsx"),
  companies: () => import("../components/CompaniesTab.jsx"),
  innovation: () => import("../features/innovation/index.js"),
  economy: () => import("../features/economy/index.js"),
};

const prefetched = new Set();

/**
 * Précharge le chunk d'un onglet (no-op si déjà fait ou inconnu).
 * @param {string} id
 */
export function prefetchTab(id) {
  if (!id || prefetched.has(id) || !loaders[id]) return;
  prefetched.add(id);
  loaders[id]().catch(() => {
    prefetched.delete(id);
  });
}

/**
 * Prefetch plusieurs onglets pendant l'idle (après premier paint).
 * @param {string[]} ids
 */
export function prefetchTabs(ids = ["feed", "messages", "shop", "videos"]) {
  const run = () => {
    for (const id of ids) prefetchTab(id);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}
