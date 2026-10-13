import { lazy } from "react";

// Retry si chunk Vercel supprimé - version safe qui ne fait pas écran noir
function lazyRetry(importFn, name) {
  return lazy(async () => {
    const tryImport = async (retries = 1) => {
      try {
        const mod = await importFn();
        // Vérifie que le module a bien un default
        if (!mod || (!mod.default && Object.keys(mod).length === 0)) {
          throw new Error(`Module ${name} vide`);
        }
        return mod;
      } catch (err) {
        const msg = String(err?.message || err || "");
        const isChunkError =
          msg.includes("Failed to fetch") ||
          msg.includes("dynamically imported") ||
          msg.includes("Loading chunk") ||
          msg.includes("Importing a module script failed");

        if (isChunkError && retries > 0) {
          console.warn(`[BAARO] Chunk ${name} obsolète, retry...`, { retries });
          await new Promise((r) => setTimeout(r, 800));
          return tryImport(retries - 1);
        }

        if (isChunkError) {
          const key = `baaro_chunk_reload_${name}`;
          const lastReload = Number(sessionStorage.getItem(key) || 0);
          if (Date.now() - lastReload > 15000) {
            sessionStorage.setItem(key, String(Date.now()));
            console.warn(`[BAARO] Reload forcé pour chunk ${name}`);
            window.location.reload();
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        throw err;
      }
    };
    return tryImport();
  });
}

export const tabs = {
  feed: lazyRetry(() => import("../features/feed/index.js").then((m) => ({ default: m.FeedTab })), "feed"),
  videos: lazyRetry(() => import("../features/videos/index.js").then((m) => ({ default: m.VideosTab })), "videos"),
  messages: lazyRetry(() => import("../features/messaging/index.js").then((m) => ({ default: m.MessagesTab })), "messages"),
  friends: lazyRetry(() => import("../features/friends/index.js").then((m) => ({ default: m.FriendsTab })), "friends"),
  debates: lazyRetry(() => import("../features/debates/index.js").then((m) => ({ default: m.DebatesTab })), "debates"),
  offline: lazyRetry(() => import("../features/offline/index.js").then((m) => ({ default: m.OfflineTab })), "offline"),
  assistant: lazyRetry(() => import("../features/ai/index.js").then((m) => ({ default: m.AiAssistantTab })), "assistant"),
  innovation: lazyRetry(() => import("../features/innovation/index.js").then((m) => ({ default: m.InnovationHub })), "innovation"),
  shop: lazyRetry(() => import("../features/shop/index.js").then((m) => ({ default: m.ShopTab })), "shop"),
  economy: lazyRetry(() => import("../features/economy/index.js").then((m) => ({ default: m.EconomyTab })), "economy"),
  companies: lazyRetry(() => import("../components/EnterprisesTab.jsx").then((m) => ({ default: m.default })), "companies"),
  stories: lazyRetry(() => import("../features/stories/index.jsx").then((m) => ({ default: m.StoriesTab })), "stories"),
  community: lazyRetry(() => import("../components/CommunityTab.jsx").then((m) => ({ default: m.default })), "community"),
  discover: lazyRetry(() => import("../components/DiscoverHub.jsx").then((m) => ({ default: m.DiscoverHub })), "discover"),
  privacy: lazyRetry(() => import("../components/PrivacyPage.jsx").then((m) => ({ default: m.PrivacyPage })), "privacy"),
  settings: lazyRetry(() => import("../features/settings/index").then((m) => ({ default: m.default })), "settings"),
  plus: lazyRetry(() => import("../features/settings/index").then((m) => ({ default: m.default })), "plus"),
};

export const TAB_IDS = Object.keys(tabs);
