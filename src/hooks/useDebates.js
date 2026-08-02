// Dans useDebates.js, modifiez useRoomChat pour ajouter un état local
const useRoomChat = (roomId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState(''); // <-- AJOUTEZ CETTE LIGNE

  // ... reste du code inchangé ...

  // Modifiez sendText pour vider inputText
  const sendText = useCallback(
    async (text) => {
      if (!text.trim()) return;
      await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: userId, sender_type: "user", text: text.trim() });
      setInputText(''); // <-- AJOUTEZ CETTE LIGNE
    },
    [roomId]
  );

  return { 
    messages, 
    loading, 
    sendText, 
    askAI, 
    aiThinking,
    inputText,        // <-- AJOUTEZ CETTE LIGNE
    setInputText      // <-- AJOUTEZ CETTE LIGNE
  };
};
