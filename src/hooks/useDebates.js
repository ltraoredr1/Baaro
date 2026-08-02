// src/hooks/useDebateMessaging.js
import { useState, useCallback } from "react";

export const useDebateMessaging = (debateId, userId) => {
  const [privateChats, setPrivateChats] = useState({});
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const openPrivateChat = useCallback(async (participantId) => {
    console.log('openPrivateChat', participantId);
    // Version simplifiée
    setActivePrivateChat({
      id: 'temp-' + Date.now(),
      otherUser: { id: participantId, display_name: 'Utilisateur', username: 'user' },
      messages: []
    });
    return null;
  }, []);

  const sendPrivateMessage = useCallback(async (text, file = null) => {
    console.log('sendPrivateMessage', text);
    setSending(true);
    setTimeout(() => setSending(false), 500);
  }, []);

  const closePrivateChat = useCallback(() => {
    setActivePrivateChat(null);
  }, []);

  const loadPrivateChats = useCallback(async () => {
    setPrivateChats({});
  }, []);

  return {
    privateChats,
    activePrivateChat,
    setActivePrivateChat,
    messages: activePrivateChat?.messages || [],
    loading,
    sending,
    loadPrivateChats,
    openPrivateChat,
    sendPrivateMessage,
    closePrivateChat
  };
};
