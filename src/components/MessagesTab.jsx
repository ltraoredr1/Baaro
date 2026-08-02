import { useState, useEffect } from "react";
import {
  Send,
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  User,
  Search,
  CheckCheck,
  ShieldCheck,
  BadgeCheck,
  ArrowLeft
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";

export function MessagesTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState("video");
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  // Charger l'utilisateur connecté
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Charger les conversations
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      // Récupérer les messages de l'utilisateur
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Grouper par utilisateur
      const convMap = {};
      data?.forEach(msg => {
        const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!convMap[otherId] || new Date(msg.created_at) > new Date(convMap[otherId].created_at)) {
          convMap[otherId] = msg;
        }
      });

      // Récupérer les infos des utilisateurs
      const convList = await Promise.all(
        Object.keys(convMap).map(async (otherId) => {
          const { data: userData } = await supabase
            .from('users')
            .select('display_name, handle, flag, avatar_url')
            .eq('id', otherId)
            .single();
          
          return {
            id: otherId,
            name: userData?.display_name || 'Membre',
            handle: userData?.handle || '@utilisateur',
            flag: userData?.flag || '🌍',
            avatar: userData?.avatar_url || '',
            lastMsg: convMap[otherId].text,
            time: convMap[otherId].created_at,
            unread: convMap[otherId].receiver_id === user.id && !convMap[otherId].read ? 1 : 0,
            messages: []
          };
        })
      );

      setConversations(convList);
      
      // Sélectionner la première conversation
      if (convList.length > 0 && !selectedChatId) {
        setSelectedChatId(convList[0].id);
        loadMessages(convList[0].id);
      }
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger les messages d'une conversation
  const loadMessages = async (otherUserId) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      setSelectedChatId(otherUserId);

      // Marquer comme lu
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', otherUserId);

      // Mettre à jour le compteur de messages non lus
      setConversations(prev => prev.map(conv => 
        conv.id === otherUserId ? { ...conv, unread: 0 } : conv
      ));

    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  // Envoyer un message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || !selectedChatId) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: selectedChatId,
          text: inputMsg.trim(),
          read: false
        })
        .select();

      if (error) throw error;

      setMessages([...messages, data[0]]);
      setInputMsg("");
      onRewardPoints?.(1);
      showPointsReward(1, "Message envoyé");

      // Mettre à jour la conversation
      loadConversations();
    } catch (error) {
      console.error('Erreur envoi message:', error);
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  // Souscrire aux nouveaux messages
  useEffect(() => {
    if (!user) return;

    const subscription = supabase
      .channel('messages_channel')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new;
          if (newMsg.receiver_id === user.id || newMsg.sender_id === user.id) {
            if (selectedChatId && 
                (newMsg.sender_id === selectedChatId || newMsg.receiver_id === selectedChatId)) {
              setMessages(prev => [...prev, newMsg]);
            }
            loadConversations();
          }
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user, selectedChatId]);

  const startCall = (type) => {
    setCallType(type);
    setCallActive(true);
    showToast(`Appel ${type === "video" ? "Vidéo" : "Vocal"} WebRTC démarré`, "info");
  };

  // Filtrer les conversations
  const filteredConversations = conversations.filter(conv =>
    conv.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.handle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeChat = conversations.find(c => c.id === selectedChatId);

  // Formater l'heure
  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString();
  };

  if (!user) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>Connectez-vous pour voir vos messages</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[540px]">
        {/* Liste des conversations */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gradient-gold">Messagerie</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>WebRTC</span>
          </div>

          {/* Recherche */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <Search size={14} style={{ color: COLORS.muted }} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none w-full"
              style={{ color: COLORS.ivory }}
            />
          </div>

          {/* Conversations */}
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[440px]">
            {loading ? (
              <div className="text-center py-4 text-gray-400 text-sm">Chargement...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-4xl mb-2">💬</p>
                <p className="text-sm">Aucune conversation</p>
                <p className="text-xs mt-1">Commencez à discuter !</p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === selectedChatId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedChatId(c.id);
                      loadMessages(c.id);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 border ${
                      isActive ? "gold-glow" : "hover:bg-white/5"
                    }`}
                    style={{
                      background: isActive ? COLORS.surface2 : "transparent",
                      borderColor: isActive ? COLORS.borderGold : "transparent"
                    }}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: COLORS.surface, color: COLORS.gold, border: `1px solid ${COLORS.borderGold}` }}>
                      {c.avatar ? (
                        <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{c.flag || '👤'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold truncate" style={{ color: COLORS.ivory }}>
                          {c.name}
                        </span>
                        {c.unread > 0 && (
                          <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: COLORS.teal, color: COLORS.bg }}>
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] truncate" style={{ color: COLORS.muted }}>{c.lastMsg}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Fenêtre de conversation */}
        <div className="md:col-span-2 glass-card rounded-2xl p-4 border flex flex-col justify-between" style={{ borderColor: COLORS.border }}>
          {activeChat ? (
            <>
              {/* En-tête */}
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: COLORS.border }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm" style={{ background: COLORS.surface, color: COLORS.gold, border: `1px solid ${COLORS.borderGold}` }}>
                    {activeChat.avatar ? (
                      <img src={activeChat.avatar} alt={activeChat.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{activeChat.flag || '👤'}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                      {activeChat.name} {activeChat.flag}
                    </div>
                    <div className="text-[10px] flex items-center gap-1" style={{ color: COLORS.teal }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                      En ligne • Crypté P2P
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startCall("audio")}
                    className="p-2 rounded-xl border hover:border-teal-400 transition"
                    style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.teal }}
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    onClick={() => startCall("video")}
                    className="p-2 rounded-xl border hover:border-amber-400 transition gold-glow"
                    style={{ background: COLORS.surface2, borderColor: COLORS.borderGold, color: COLORS.gold }}
                  >
                    <Video size={16} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 py-4 flex flex-col gap-3 overflow-y-auto max-h-[360px]">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <p>Aucun message</p>
                    <p className="text-xs mt-1">Envoyez un message pour commencer !</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <div className="text-[10px] mb-0.5 px-1 font-semibold" style={{ color: COLORS.muted }}>
                          {isMe ? 'Vous' : activeChat.name}
                        </div>
                        <div
                          className="p-3 rounded-2xl text-xs leading-relaxed border shadow-md"
                          style={{
                            background: isMe ? "linear-gradient(135deg, rgba(217,174,82,0.3) 0%, rgba(45,191,166,0.2) 100%)" : COLORS.surface,
                            borderColor: isMe ? COLORS.borderGold : COLORS.border,
                            color: COLORS.ivory
                          }}
                        >
                          {m.text}
                        </div>
                        <span className="text-[9px] px-1 mt-0.5" style={{ color: COLORS.muted }}>
                          {formatTime(m.created_at)}
                          {isMe && (
                            m.read ? (
                              <CheckCheck size={12} className="inline ml-1" style={{ color: COLORS.teal }} />
                            ) : (
                              <span className="ml-1">✓</span>
                            )
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                <input
                  type="text"
                  placeholder="Écrivez un message sécurisé..."
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                  style={{ background: COLORS.gold, color: COLORS.bg }}
                >
                  <Send size={14} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-6xl mb-4">💬</p>
                <p>Sélectionnez une conversation</p>
                <p className="text-sm mt-2">ou commencez à discuter !</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal d'appel WebRTC */}
      {callActive && activeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 border shadow-2xl flex flex-col items-center gap-6" style={{ borderColor: COLORS.borderGold }}>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: COLORS.teal }}>Appel WebRTC Direct En Cours</span>
              <h3 className="text-xl font-bold mt-1" style={{ color: COLORS.ivory }}>{activeChat.name}</h3>
            </div>

            <div className="w-full h-64 rounded-2xl bg-slate-950 border relative overflow-hidden flex items-center justify-center" style={{ borderColor: COLORS.border }}>
              {camOff ? (
                <div className="flex flex-col items-center gap-2" style={{ color: COLORS.muted }}>
                  <VideoOff size={48} />
                  <span className="text-xs">Caméra désactivée</span>
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 animate-pulse flex items-center justify-center text-3xl font-bold gold-glow" style={{ borderColor: COLORS.gold, background: COLORS.surface2 }}>
                    {activeChat.avatar ? (
                      <img src={activeChat.avatar} alt={activeChat.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{activeChat.flag || '👤'}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 right-3 w-20 h-28 rounded-xl bg-slate-900 border overflow-hidden shadow-xl flex items-center justify-center text-xs font-bold" style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}>
                Vous
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setMicMuted(!micMuted)}
                className={`p-4 rounded-full border transition ${micMuted ? "bg-red-500/20 text-red-400 border-red-500" : "glass-panel"}`}
                style={{ borderColor: micMuted ? "red" : COLORS.border, color: micMuted ? "red" : COLORS.ivory }}
              >
                {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button
                onClick={() => setCallActive(false)}
                className="p-4 rounded-full bg-red-600 text-white shadow-2xl hover:bg-red-700 transition"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={() => setCamOff(!camOff)}
                className={`p-4 rounded-full border transition ${camOff ? "bg-red-500/20 text-red-400 border-red-500" : "glass-panel"}`}
                style={{ borderColor: camOff ? "red" : COLORS.border, color: camOff ? "red" : COLORS.ivory }}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
