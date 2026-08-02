// src/components/DebatePrivateChat.jsx
import { useState, useRef, useEffect } from "react";
import { 
  X, Send, Paperclip, Image, Mic, User, Check, CheckCheck, 
  Loader2, Play, Download, ArrowLeft 
} from "lucide-react";
import { COLORS } from "../theme.js";

export function DebatePrivateChat({ 
  isOpen, 
  onClose, 
  chatData, 
  userId, 
  onSendMessage,
  onSendFile,
  sending 
}) {
  const [messageInput, setMessageInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const { otherUser, messages = [] } = chatData || { otherUser: null, messages: [] };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    await onSendMessage(messageInput);
    setMessageInput("");
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("Fichier trop volumineux (max 10MB)");
      return;
    }

    await onSendFile(file);
    fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        onSendFile(audioFile);
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (msg) => {
    const isMine = msg.sender_id === userId;

    return (
      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
        <div 
          className={`max-w-[80%] p-3 rounded-2xl text-sm ${
            isMine ? 'rounded-br-none' : 'rounded-bl-none'
          }`}
          style={{
            background: isMine ? COLORS.gold : COLORS.surface,
            color: isMine ? COLORS.bg : COLORS.ivory
          }}
        >
          {msg.message_type === 'text' && msg.content && (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          )}

          {msg.message_type === 'image' && msg.file_url && (
            <div className="mt-1">
              <img 
                src={msg.file_url} 
                alt={msg.file_name || 'Image'} 
                className="max-w-full rounded-lg max-h-48 object-contain"
                loading="lazy"
              />
            </div>
          )}

          {msg.message_type === 'file' && msg.file_url && (
            <div className="flex items-center gap-3 p-2 rounded-lg mt-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <File size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{msg.file_name}</p>
                <p className="text-[10px] opacity-60">{(msg.file_size / 1024).toFixed(1)} KB</p>
              </div>
              <a href={msg.file_url} download={msg.file_name} className="p-1.5 rounded-full hover:bg-white/10">
                <Download size={16} />
              </a>
            </div>
          )}

          {msg.message_type === 'voice' && msg.file_url && (
            <div className="flex items-center gap-3 mt-1">
              <button onClick={() => new Audio(msg.file_url).play()} className="p-2 rounded-full hover:bg-white/10">
                <Play size={16} />
              </button>
              <div className="flex-1 h-1 rounded-full bg-white/10">
                <div className="h-full w-1/3 rounded-full" style={{ background: COLORS.teal }} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] opacity-60">{formatTime(msg.created_at)}</span>
            {isMine && (msg.read_at ? <CheckCheck size={12} className="text-green-400" /> : <Check size={12} className="opacity-60" />)}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen || !chatData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80">
      <div 
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col"
        style={{ background: COLORS.bg, maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b rounded-t-2xl flex-shrink-0" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg">
              <ArrowLeft size={20} style={{ color: COLORS.ivory }} />
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" 
                 style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
              {otherUser?.display_name?.[0] || otherUser?.username?.[0] || '?'}
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>{otherUser?.display_name || otherUser?.username || 'Utilisateur'}</p>
              <p className="text-xs" style={{ color: COLORS.muted }}>En privé</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg">
            <X size={20} style={{ color: COLORS.ivory }} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px] max-h-[400px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <User size={32} style={{ color: COLORS.muted }} className="opacity-30" />
              <p className="text-sm mt-2" style={{ color: COLORS.muted }}>
                Aucun message privé
              </p>
              <p className="text-xs" style={{ color: COLORS.muted }}>
                Commencez la conversation avec {otherUser?.display_name || 'ce participant'}
              </p>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t flex-shrink-0" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-white/5">
              <Paperclip size={18} style={{ color: COLORS.muted }} />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-white/5">
              <Image size={18} style={{ color: COLORS.muted }} />
            </button>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 rounded-lg hover:bg-white/5 ${isRecording ? 'animate-pulse' : ''}`}
            >
              <Mic size={18} style={{ color: isRecording ? '#EF4444' : COLORS.muted }} />
            </button>
            <input
              type="text"
              placeholder={isRecording ? '🎤 Enregistrement...' : 'Message privé...'}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              disabled={sending || isRecording}
              className="flex-1 bg-transparent border-0 outline-none text-sm px-2 disabled:opacity-50"
              style={{ color: COLORS.ivory }}
            />
            <button 
              onClick={handleSend}
              disabled={!messageInput.trim() || sending || isRecording}
              className="p-2 rounded-lg gold-glow disabled:opacity-50"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
