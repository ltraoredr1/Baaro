import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useMessaging(conversationId, currentUserId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;

    // 1. Charger l'historique
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:sender_id(display_name, flag), recipient:recipient_id(display_name, flag)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      
      if (!error) setMessages(data || []);
      setLoading(false);
    };
    fetchMessages();

    // 2. S'abonner aux nouveaux messages en temps réel
    const channel = supabase.channel(`room:${conversationId}`)
      .on('postgres_changes', { 
        event: 'INSERT', schema: 'public', table: 'messages', 
        filter: `conversation_id=eq.${conversationId}` 
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = async (text, recipientId) => {
    if (!text.trim()) return;
    
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      recipient_id: recipientId,
      text: text.trim()
    });

    if (error) console.error('Échec de l\'envoi:', error);
  };

  return { messages, loading, sendMessage };
}
