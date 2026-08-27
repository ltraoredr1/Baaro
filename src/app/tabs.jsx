import { lazy } from "react";

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
  shop: lazy(() =>
    import("../features/shop/index.js").then((m) => ({ default: m.ShopTab }))
  ),

  // FIX: settings est en default export
  settings: lazy(() =>
    import("../features/settings/index.tsx").then((m) => ({ default: m.default }))
  ),

  // PLUS = onglet qui contient settings (comme tu veux)
  plus: lazy(() =>
    import("../features/settings/index.tsx").then((m) => ({ default: m.default }))
  ),
};

export const TAB_IDS = Object.keys(tabs);
