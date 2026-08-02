// src/components/DebatePrivateChat.jsx
import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, ArrowLeft } from "lucide-react";
import { COLORS } from "../theme.js";

export function DebatePrivateChat({ 
  isOpen, 
  onClose, 
  chatData, 
  userId, 
  onSendMessage,
  sending 
}) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData?.messages]);

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    await onSendMessage(messageInput);
    setMessageInput("");
  };

  if (!isOpen || !chatData) return null;

  const { otherUser, messages = [] } = chatData;

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
            <div>
              <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                {otherUser?.display_name || otherUser?.username || 'Utilisateur'}
              </p>
              <p className="text-xs" style={{ color: COLORS.muted }}>Message privé</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg">
            <X size={20} style={{ color: COLORS.ivory }} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[200px] max-h-[400px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-sm" style={{ color: COLORS.muted }}>
                Aucun message privé
              </p>
            </div>
          ) : (
            messages.map((msg) => {
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
                    <p className="whitespace-pre-wrap break-words">{msg.content || msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t flex-shrink-0" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Message privé..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              disabled={sending}
              className="flex-1 bg-transparent border-0 outline-none text-sm px-2 disabled:opacity-50"
              style={{ color: COLORS.ivory }}
            />
            <button 
              onClick={handleSend}
              disabled={!messageInput.trim() || sending}
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
