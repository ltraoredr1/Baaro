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
  companies: lazy(() =>
    import("../components/EnterprisesTab.jsx").then((m) => ({
      default: m.default,
    }))
  ),
  community: lazy(() =>
    import("../components/CommunityTab.jsx").then((m) => ({
      default: m.default,
    }))
  ),
  discover: lazy(() =>
    import("../components/DiscoverHub.jsx").then((m) => ({
      default: m.DiscoverHub,
    }))
  ),
  privacy: lazy(() =>
    import("../components/PrivacyPage.jsx").then((m) => ({
      default: m.PrivacyPage,
    }))
  ),
  // FIX : on enlève le .tsx en dur, Vite va le résoudre tout seul (JS ou TS)
  settings: lazy(() =>
    import("../features/settings/index").then((m) => ({
      default: m.default,
    }))
  ),
  plus: lazy(() =>
    import("../features/settings/index").then((m) => ({
      default: m.default,
    }))
  ),
};

export const TAB_IDS = Object.keys(tabs);
