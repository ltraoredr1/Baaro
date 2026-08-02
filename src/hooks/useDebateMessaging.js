// src/hooks/useDebateMessaging.js
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

export const useDebateMessaging = (debateId, userId) => {
  const [privateChats, setPrivateChats] = useState({});
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Récupérer les infos d'un utilisateur
  const fetchUserInfo = useCallback(async (userId) => {
    if (!userId) return null;
    
    try {
      // Essayer d'abord la table profiles
      let { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      
      // Si pas dans profiles, essayer users
      if (!data || error) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, username, display_name, avatar_url')
          .eq('id', userId)
          .single();
        
        if (userData) {
          data = userData;
        }
      }
      
      return data || { id: userId, username: 'Utilisateur', display_name: 'Utilisateur' };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return { id: userId, username: 'Utilisateur', display_name: 'Utilisateur' };
    }
  }, []);

  // Charger les conversations privées
  const loadPrivateChats = useCallback(async () => {
    if (!debateId || !userId) return;

    setLoading(true);
    try {
      // Récupérer toutes les conversations du débat
      const { data: conversations, error: convError } = await supabase
        .from('debate_conversations')
        .select('*')
        .eq('debate_id', debateId)
        .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`);

      if (convError) throw convError;

      if (!conversations || conversations.length === 0) {
        setPrivateChats({});
        setLoading(false);
        return;
      }

      // Pour chaque conversation, récupérer les messages et les infos des participants
      const chats = {};
      for (const conv of conversations) {
        // Déterminer l'autre participant
        const otherUserId = conv.participant1_id === userId 
          ? conv.participant2_id 
          : conv.participant1_id;
        
        // Récupérer les infos de l'autre participant
        const otherUser = await fetchUserInfo(otherUserId);
        
        // Récupérer les messages
        const { data: messages, error: msgError } = await supabase
          .from('debate_private_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        // Marquer les messages non lus
        const unreadCount = messages?.filter(m => 
          m.sender_id !== userId && !m.read_at
        ).length || 0;

        // Marquer comme lu
        if (unreadCount > 0) {
          await supabase
            .from('debate_private_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', conv.id)
            .neq('sender_id', userId)
            .is('read_at', null);
        }

        chats[conv.id] = {
          id: conv.id,
          otherUser: otherUser,
          messages: messages || [],
          unreadCount: unreadCount,
          lastMessage: messages?.[messages.length - 1] || null,
          updated_at: conv.updated_at
        };
      }

      setPrivateChats(chats);
    } catch (error) {
      console.error('Error loading private chats:', error);
    } finally {
      setLoading(false);
    }
  }, [debateId, userId, fetchUserInfo]);

  // Ouvrir une conversation privée
  const openPrivateChat = useCallback(async (participantId) => {
    if (!participantId || participantId === userId) {
      console.warn('Cannot open chat with self');
      return null;
    }

    setLoading(true);
    try {
      // Vérifier si la conversation existe déjà
      let { data: existing, error: checkError } = await supabase
        .from('debate_conversations')
        .select('id')
        .eq('debate_id', debateId)
        .or(`and(participant1_id.eq.${userId},participant2_id.eq.${participantId}),and(participant1_id.eq.${participantId},participant2_id.eq.${userId})`)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      let convId = existing?.id;

      // Créer si elle n'existe pas
      if (!convId) {
        const { data: newConv, error: createError } = await supabase
          .from('debate_conversations')
          .insert([{
            debate_id: debateId,
            participant1_id: userId,
            participant2_id: participantId
          }])
          .select()
          .single();

        if (createError) throw createError;
        convId = newConv.id;
      }

      // Récupérer les infos de l'autre participant
      const otherUser = await fetchUserInfo(participantId);

      // Charger les messages
      const { data: messages, error: msgError } = await supabase
        .from('debate_private_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      // Marquer comme lu
      await supabase
        .from('debate_private_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', convId)
        .neq('sender_id', userId)
        .is('read_at', null);

      const chatData = {
        id: convId,
        otherUser: otherUser,
        messages: messages || []
      };

      setActivePrivateChat(chatData);
      
      // Mettre à jour le cache
      setPrivateChats(prev => ({
        ...prev,
        [convId]: {
          ...prev[convId],
          ...chatData,
          unreadCount: 0
        }
      }));

      return convId;
    } catch (error) {
      console.error('Error opening private chat:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [debateId, userId, fetchUserInfo]);

  // Envoyer un message privé
  const sendPrivateMessage = useCallback(async (text, file = null) => {
    if (!activePrivateChat) {
      console.warn('No active chat');
      return;
    }
    if (!text?.trim() && !file) return;

    setSending(true);
    try {
      let fileData = null;

      // Upload du fichier si présent
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `debate-private/${activePrivateChat.id}/${fileName}`;
        
        // Vérifier si le bucket existe
        const { error: uploadError } = await supabase.storage
          .from('debate-files')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          // Essayer avec un bucket différent si le premier échoue
          const { error: uploadError2 } = await supabase.storage
            .from('debate-messages')
            .upload(filePath, file);
          
          if (uploadError2) throw uploadError2;
          
          const { data: { publicUrl } } = supabase.storage
            .from('debate-messages')
            .getPublicUrl(filePath);
          
          fileData = {
            url: publicUrl,
            name: file.name,
            size: file.size,
            type: file.type,
            messageType: file.type?.startsWith('image/') ? 'image' : 'file'
          };
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('debate-files')
            .getPublicUrl(filePath);
          
          fileData = {
            url: publicUrl,
            name: file.name,
            size: file.size,
            type: file.type,
            messageType: file.type?.startsWith('image/') ? 'image' : 'file'
          };
        }
      }

      // Déterminer le type de message
      let messageType = 'text';
      if (fileData) {
        messageType = fileData.messageType;
      }

      // Construire le message
      const messageData = {
        conversation_id: activePrivateChat.id,
        sender_id: userId,
        debate_id: debateId,
        message_type: messageType,
        content: text?.trim() || null,
        file_url: fileData?.url || null,
        file_name: fileData?.name || null,
        file_size: fileData?.size || null,
        mime_type: fileData?.type || null
      };

      const { data, error } = await supabase
        .from('debate_private_messages')
        .insert([messageData])
        .select()
        .single();

      if (error) throw error;

      // Mettre à jour les messages localement
      setActivePrivateChat(prev => ({
        ...prev,
        messages: [...prev.messages, data]
      }));

      // Mettre à jour le cache
      setPrivateChats(prev => ({
        ...prev,
        [activePrivateChat.id]: {
          ...prev[activePrivateChat.id],
          messages: [...(prev[activePrivateChat.id]?.messages || []), data],
          lastMessage: data
        }
      }));

      return data;
    } catch (error) {
      console.error('Error sending private message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [activePrivateChat, userId, debateId]);

  // Réaltime pour les nouveaux messages
  useEffect(() => {
    if (!activePrivateChat) return;

    const channel = supabase
      .channel(`private-messages:${activePrivateChat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'debate_private_messages',
        filter: `conversation_id=eq.${activePrivateChat.id}`
      }, async (payload) => {
        const newMsg = payload.new;
        if (newMsg.sender_id !== userId) {
          // Marquer comme lu
          await supabase
            .from('debate_private_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', newMsg.id);
          
          // Ajouter le message à l'état local
          setActivePrivateChat(prev => ({
            ...prev,
            messages: [...prev.messages, newMsg]
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activePrivateChat, userId]);

  // Charger les conversations au montage
  useEffect(() => {
    if (debateId && userId) {
      loadPrivateChats();
    }
  }, [debateId, userId]);

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
    closePrivateChat: () => setActivePrivateChat(null)
  };
};
