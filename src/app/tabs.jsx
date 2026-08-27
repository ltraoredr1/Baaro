import { lazy } from "react";

/**
 * Map tabId → composant lazy (code-splitting par feature).
 * Destination : src/app/tabs.jsx
 */
export const tabs = {
  feed: lazy(() =>
    import("../features/feed/index.js").then((m) => ({ default: m.FeedTab }))
  ),
  videos: lazy(() =>
    import("../features/videos/index.js").then((m) => ({ default: m.VideosTab }))
  ),
  messages: lazy(() =>
    import("../features/messaging/index.js").then((m) => ({
      default: m.MessagesTab,
    }))
  ),
  wallet: lazy(() =>
    import("../features/wallet/index.js").then((m) => ({ default: m.WalletTab }))
  ),
  crypto: lazy(() =>
    import("../features/crypto/index.js").then((m) => ({ default: m.CryptoTab }))
  ),
  friends: lazy(() =>
    import("../features/friends/index.js").then((m) => ({
      default: m.FriendsTab,
    }))
  ),
  debates: lazy(() =>
    import("../features/debates/index.js").then((m) => ({
      default: m.DebatesTab,
    }))
  ),
  offline: lazy(() =>
    import("../features/offline/index.js").then((m) => ({
      default: m.OfflineTab,
    }))
  ),
  assistant: lazy(() =>
    import("../features/ai/index.js").then((m) => ({
      default: m.AiAssistantTab,
    }))
  ),
  settings: lazy(() =>
    import("../features/settings/index.tsx").then((m) => ({
      default: m.SettingsTab,
    }))
  ),
  shop: lazy(() =>
    import("../features/shop/index.js").then((m) => ({ default: m.ShopTab }))
  ),
};

export const TAB_IDS = Object.keys(tabs);
