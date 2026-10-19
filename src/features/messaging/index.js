// Components - vrais chemins relatifs DANS la feature
export { MessagesTab } from "./components/MessagesTab.jsx";
export { ChatCallModal } from "./components/ChatCallModal.jsx";
export { MessageBubble } from "./components/MessageBubble.jsx";
export { ChatInput } from "./components/ChatInput.jsx";

// Hooks
export { useMessaging } from "./hooks/useMessaging.js";
export { useCryptoKeys } from "./hooks/useCryptoKeys.js";

// Lib
export * from "./lib/crypto.js";
export * from "./lib/calls.js";

// Services
export { messageService, callsService } from "./services/messageService.js";
