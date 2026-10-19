/**
 * src/features/messaging/index.js - Barrel unique - vrais chemins
 */
// Components - vrais chemins DANS la feature
export { MessagesTab } from "./components/MessagesTab.jsx";
export { ChatCallModal } from "./components/ChatCallModal.jsx";
export { MessageBubble } from "./components/MessageBubble.jsx";
export { ChatInput } from "./components/ChatInput.jsx";

// Hooks
export { useMessaging } from "./hooks/useMessaging.js";
export { useCryptoKeys } from "./hooks/useCryptoKeys.js";
export { useConversations } from "./hooks/useConversations.js";

// Lib
export * from "./lib/crypto.js";
export * from "./lib/calls.js";

// Services
export { messageService, callsService } from "./services/messageService.js";
