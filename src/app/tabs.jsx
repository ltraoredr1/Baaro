import { lazy } from "react";

// Retry si chunk Vercel supprimé - fix Failed to fetch
function lazyRetry(importFn, name) {
  return lazy(async () => {
    const tryImport = async (retries = 2) => {
      try {
        return await importFn();
      } catch (err) {
        const msg = String(err?.message || "");
        const isChunkError = msg.includes("Failed to fetch") || msg.includes("dynamically imported") || msg.includes("Loading chunk");

        if (isChunkError && retries > 0) {
          console.warn(`[BAARO] Chunk ${name} obsolète, retry...`, retries);
          // Petite pause puis retry
          await new Promise(r => setTimeout(r, 600));
          return tryImport(retries - 1);
        }
        
        // Dernier essai : force reload une seule fois
        if (isChunkError) {
          const lastReload = Number(sessionStorage.getItem("baaro_chunk_reload_tabs") || 0);
          if (Date.now() - lastReload > 15000) {
            sessionStorage.setItem("baaro_chunk_reload_tabs", String(Date.now()));
            window.location.reload();
          }
        }
        throw err;
      }
    };
    return tryImport();
  });
}

export const tabs = {
  feed: lazyRetry(() => import("../features/feed/index.js").then(m => ({ default: m.FeedTab })), "feed"),
  videos: lazyRetry(() => import("../features/videos/index.js").then(m => ({ default: m.VideosTab })), "videos"),
  messages: lazyRetry(() => import("../features/messaging/index.js").then(m => ({ default: m.MessagesTab })), "messages"),
  wallet: lazyRetry(() => import("../features/wallet/index.js").then(m => ({ default: m.WalletTab })), "wallet"),
  crypto: lazyRetry(() => import("../features/crypto/index.js").then(m => ({ default: m.CryptoTab })), "crypto"),
  friends: lazyRetry(() => import("../features/friends/index.js").then(m => ({ default: m.FriendsTab })), "friends"),
  debates: lazyRetry(() => import("../features/debates/index.js").then(m => ({ default: m.DebatesTab })), "debates"),
  offline: lazyRetry(() => import("../features/offline/index.js").then(m => ({ default: m.OfflineTab })), "offline"),
  assistant: lazyRetry(() => import("../features/ai/index.js").then(m => ({ default: m.AiAssistantTab })), "assistant"),
  shop: lazyRetry(() => import("../features/shop/index.js").then(m => ({ default: m.ShopTab })), "shop"),
  companies: lazyRetry(() => import("../components/EnterprisesTab.jsx").then(m => ({ default: m.default })), "companies"),
  community: lazyRetry(() => import("../components/CommunityTab.jsx").then(m => ({ default: m.default })), "community"),
  discover: lazyRetry(() => import("../components/DiscoverHub.jsx").then(m => ({ default: m.DiscoverHub })), "discover"),
  privacy: lazyRetry(() => import("../components/PrivacyPage.jsx").then(m => ({ default: m.PrivacyPage })), "privacy"),
  settings: lazyRetry(() => import("../features/settings/index").then(m => ({ default: m.default })), "settings"),
  plus: lazyRetry(() => import("../features/settings/index").then(m => ({ default: m.default })), "plus"),
};

export const TAB_IDS = Object.keys(tabs);
