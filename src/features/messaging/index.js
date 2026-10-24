/**
 * src/features/messaging/index.js - barrel
 *
 * ChatCallModal importe déjà "../lib/chatCalls.js" (C majuscule) : ce fichier
 * existe donc. L'ancien commentaire visait "chatcalls.js" (minuscule), qui
 * échoue sur Linux/Vercel (système de fichiers sensible à la casse).
 */
export { MessagesTab } from "../friends/MessagesTab.jsx";
export { ChatInput } from "./components/ChatInput.jsx";
export { MessageBubble } from "./components/MessageBubble.jsx";
export { ChatCallModal } from "./components/ChatCallModal.jsx";

// Hooks
export { useMessaging } from "./hooks/useMessaging.js";
export { useCryptoKeys } from "./hooks/useCryptoKeys.js";
export { useConversations } from "./hooks/useConversations.js";
export { useMessageExtras } from "./hooks/useMessageExtras.js";

// Libs
export * from "./lib/crypto.js";
export * from "./lib/chatCalls.js";
