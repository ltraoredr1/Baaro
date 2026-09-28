// src/components/ChatWindow.jsx
import { uploadChatFile, getReadableUrl } from '@/lib/chatMedia.js';

const handleFileSelect = async (file) => {
  try {
    setUploading(true);
    
    // Upload vers Telegram
    const media = await uploadChatFile(file, userId);
    
    // Envoyer le message avec l'URL
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      content: `📎 ${file.name}`,
      media_url: media.url,
      media_provider: media.provider, // 'telegram'
      media_type: mimeToMessageType(file.type),
    });
    
    toast.success('✅ Fichier envoyé!');
  } catch (error) {
    toast.error(`❌ ${error.message}`);
  } finally {
    setUploading(false);
  }
};
