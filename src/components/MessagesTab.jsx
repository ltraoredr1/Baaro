import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { 
  Send, Search, CheckCheck, UserPlus, 
  Mic, MicOff, Volume2, X
} from "lucide-react";

export function MessagesTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [showNewChat, setShowNewChat] = useState(false);

  // États audio
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      const { data } = await supabase.from('users').select('id, display_name, handle, flag, avatar_url');
      setAllUsers(data || []);
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const convList = await Promise.all((data || []).map(async (conv) => {
        const otherId = conv.participant1_id === user.id ? conv.participant2_id : conv.participant1_id;
        const { data: userData } = await supabase
          .from('users')
          .select('display_name, handle, flag, avatar_url')
          .eq('id', otherId)
          .single();

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('text, created_at, read, sender_id')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const msg = lastMsg?.[0];
        return {
          id: conv.id,
          otherId,
          ...userData,
          lastMsg: msg?.text || 'Nouvelle conversation',
          lastMsgTime: msg?.created_at || conv.created_at,
          unread: msg && msg.sender_id !== user.id && !msg.read ? 1 : 0
        };
      }));

      setConversations(convList);
      if (convList.length > 0 && !selectedConvId) {
        setSelectedConvId(convList[0].id);
        loadMessages(convList[0].id);
      }
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convId) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      setSelectedConvId(convId);

      await supabase
        .from('messages')
        .update({ read: true })
        .eq('conversation_id', convId)
        .eq('receiver_id', user.id)
        .neq('read', true);

      setConversations(prev => prev.map(c => 
        c.id === convId ? { ...c, unread: 0 } : c
      ));
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  // ========== AUDIO ==========

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) { stopRecording(); return prev; }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      showToast('Accès microphone refusé', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const uploadAudio = async (blob) => {
    const filePath = `messages/audio_${Date.now()}.webm`;
    const { error } = await supabase.storage.from('audio').upload(filePath, blob);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(filePath);
    console.log('✅ Audio uploadé:', publicUrl);
    return publicUrl;
  };

  const sendVoiceMessage = async () => {
    if (!audioBlob || !selectedConvId) return;
    try {
      const conv = conversations.find(c => c.id === selectedConvId);
      if (!conv) return;

      const audioUrlUploaded = await uploadAudio(audioBlob);

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConvId,
          sender_id: user.id,
          receiver_id: conv.otherId,
          text: '🎙️ Message vocal',
          audio_url: audioUrlUploaded,
          audio_duration: recordingTime,
          read: false
        })
        .select();

      if (error) throw error;

      setMessages([...messages, data[0]]);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      onRewardPoints?.(2);
      showPointsReward(2, "Message vocal envoyé");
      loadConversations();
    } catch (error) {
      showToast('Erreur envoi audio: ' + error.message, 'error');
    }
  };

  // 🔥 LECTURE AUDIO CORRIGÉE
  const playAudio = (url) => {
    if (!url) {
      showToast('❌ URL audio manquante', 'error');
      return;
    }

    try {
      const audio = new Audio(url);
      audio.onerror = () => {
        showToast('❌ Erreur de lecture audio', 'error');
      };
      audio.oncanplay = () => {
        audio.play().catch(() => showToast('❌ Lecture impossible', 'error'));
      };
      audio.load();
    } catch (error) {
      showToast('❌ Erreur: ' + error.message, 'error');
    }
  };

  const formatDuration = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  // ========== FIN AUDIO ==========

  const sendMessage = async () => {
    if (!inputMsg.trim() || !selectedConvId) return;
    try {
      const conv = conversations.find(c => c.id === selectedConvId);
      if (!conv) return;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConvId,
          sender_id: user.id,
          receiver_id: conv.otherId,
          text: inputMsg.trim(),
          read: false
        })
        .select();

      if (error) throw error;

      setMessages([...messages, data[0]]);
      setInputMsg("");
      onRewardPoints?.(1);
      showPointsReward(1, "Message envoyé");
      loadConversations();
    } catch (error) {
      showToast('Erreur envoi', 'error');
    }
  };

  const startNewChat = async (otherUserId) => {
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${user.id})`);

      let convId;
      if (existing && existing.length > 0) {
        convId = existing[0].id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ participant1_id: user.id, participant2_id: otherUserId })
          .select();
        convId = newConv[0].id;
      }

      setShowNewChat(false);
      await loadConversations();
      setSelectedConvId(convId);
      loadMessages(convId);
    } catch (error) {
      showToast('Erreur création', 'error');
    }
  };

  useEffect(() => {
    if (!user) return;

    const subscription = supabase
      .channel('messages_channel')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new;
          if (msg.receiver_id === user.id || msg.sender_id === user.id) {
            if (selectedConvId && msg.conversation_id === selectedConvId) {
              setMessages(prev => [...prev, msg]);
            }
            loadConversations();
          }
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user, selectedConvId]);

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString();
  };

  const filteredUsers = allUsers.filter(u => 
    u.id !== user?.id && 
    (u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     u.handle?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeConv = conversations.find(c => c.id === selectedConvId);

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
            <button
              onClick={() => setShowNewChat(!showNewChat)}
              className="p-1.5 rounded-xl border hover:border-amber-400 transition"
              style={{ borderColor: COLORS.border, color: COLORS.gold }}
            >
              <UserPlus size={16} />
            </button>
          </div>

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

          {showNewChat && (
            <div className="max-h-40 overflow-y-auto border rounded-xl p-2" style={{ borderColor: COLORS.border }}>
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-gray-400 p-2 text-center">Aucun utilisateur trouvé</p>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => startNewChat(u.id)}
                    className="w-full text-left p-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-2 text-sm"
                    style={{ color: COLORS.ivory }}
                  >
                    <span>{u.flag || '👤'}</span>
                    <span>{u.display_name}</span>
                    <span className="text-xs text-gray-400">{u.handle}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 overflow-y-auto max-h-[400px]">
            {loading ? (
              <div className="text-center py-4 text-gray-400 text-sm">Chargement...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-4xl mb-2">💬</p>
                <p className="text-sm">Aucune conversation</p>
                <p className="text-xs mt-1">Cliquez sur ➕ pour commencer !</p>
              </div>
            ) : (
              conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedConvId(c.id); loadMessages(c.id); }}
                  className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 border ${
                    c.id === selectedConvId ? 'gold-glow' : 'hover:bg-white/5'
                  }`}
                  style={{
                    background: c.id === selectedConvId ? COLORS.surface2 : 'transparent',
                    borderColor: c.id === selectedConvId ? COLORS.borderGold : 'transparent'
                  }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderGold}` }}>
                    {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full rounded-full object-cover" /> : <span>{c.flag || '👤'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold truncate" style={{ color: COLORS.ivory }}>{c.display_name}</span>
                      {c.unread > 0 && <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: COLORS.teal, color: COLORS.bg }}>{c.unread}</span>}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: COLORS.muted }}>{c.lastMsg}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Fenêtre de conversation */}
        <div className="md:col-span-2 glass-card rounded-2xl p-4 border flex flex-col" style={{ borderColor: COLORS.border }}>
          {activeConv ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b flex-shrink-0" style={{ borderColor: COLORS.border }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderGold}` }}>
                    {activeConv.avatar_url ? <img src={activeConv.avatar_url} className="w-full h-full rounded-full object-cover" /> : <span>{activeConv.flag || '👤'}</span>}
                  </div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>{activeConv.display_name}</div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>{activeConv.handle}</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 py-4 flex flex-col gap-3 overflow-y-auto max-h-[360px]">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <p>Aucun message</p>
                    <p className="text-xs mt-1">Envoyez un message !</p>
                  </div>
                ) : (
                  messages.map(m => {
                    const isMe = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <div className="text-[10px] mb-0.5 px-1" style={{ color: COLORS.muted }}>{isMe ? 'Vous' : activeConv.display_name}</div>
                        <div className="p-3 rounded-2xl text-xs leading-relaxed border shadow-md" style={{
                          background: isMe ? "linear-gradient(135deg, rgba(217,174,82,0.3) 0%, rgba(45,191,166,0.2) 100%)" : COLORS.surface,
                          borderColor: isMe ? COLORS.borderGold : COLORS.border,
                          color: COLORS.ivory
                        }}>
                          {m.text}
                          {m.audio_url && (
                            <div className="mt-1 flex items-center gap-2 p-1.5 rounded-lg" style={{ background: COLORS.surface2 }}>
                              <button
                                onClick={() => playAudio(m.audio_url)}
                                className="p-1.5 rounded-full"
                                style={{ background: COLORS.gold, color: COLORS.bg }}
                              >
                                <Volume2 size={12} />
                              </button>
                              <span className="text-xs text-gray-400">
                                🎙️ {m.audio_duration ? formatDuration(m.audio_duration) : '00:00'}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] px-1 mt-0.5" style={{ color: COLORS.muted }}>
                          {formatTime(m.created_at)}
                          {isMe && (m.read ? <CheckCheck size={12} className="inline ml-1" style={{ color: COLORS.teal }} /> : <span className="ml-1">✓</span>)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Zone de saisie avec audio */}
              <div className="pt-3 border-t flex-shrink-0" style={{ borderColor: COLORS.border }}>
                {!audioBlob && !isRecording ? (
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Écrivez un message..."
                      value={inputMsg}
                      onChange={(e) => setInputMsg(e.target.value)}
                      className="flex-1 bg-gray-800/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1"
                      style={{ 
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.ivory,
                        backgroundColor: 'rgba(0,0,0,0.3)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-2.5 rounded-xl transition"
                      style={{ background: COLORS.surface2, color: COLORS.gold }}
                      title="Message vocal"
                    >
                      <Mic size={18} />
                    </button>
                    <button
                      type="submit"
                      disabled={!inputMsg.trim()}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40 flex items-center gap-1"
                      style={{ 
                        background: COLORS.gold, 
                        color: COLORS.bg,
                        minWidth: '60px'
                      }}
                    >
                      <Send size={16} />
                      Envoyer
                    </button>
                  </form>
                ) : isRecording ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono" style={{ color: '#ef4444' }}>
                      {formatDuration(recordingTime)}
                    </span>
                    <span className="text-xs text-gray-400">Enregistrement...</span>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="ml-auto p-1.5 rounded-full bg-red-500 text-white"
                    >
                      <MicOff size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: COLORS.surface2 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const audio = new Audio(audioUrl);
                        audio.play();
                      }}
                      className="p-1.5 rounded-full"
                      style={{ background: COLORS.gold, color: COLORS.bg }}
                    >
                      <Volume2 size={14} />
                    </button>
                    <span className="text-xs text-gray-400">
                      {formatDuration(recordingTime)}
                    </span>
                    <span className="text-xs text-gray-400">🎙️ Prêt</span>
                    <button
                      type="button"
                      onClick={sendVoiceMessage}
                      className="ml-auto p-1.5 rounded-full"
                      style={{ background: COLORS.teal, color: COLORS.bg }}
                    >
                      <Send size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="p-1.5 rounded-full text-gray-400 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-6xl mb-4">💬</p>
                <p>Sélectionnez une conversation</p>
                <p className="text-sm mt-2">ou cliquez sur ➕ pour commencer !</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
