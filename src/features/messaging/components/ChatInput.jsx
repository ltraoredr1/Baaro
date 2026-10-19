/**
 * src/features/messaging/components/ChatInput.jsx
 */
import React, { useState, useRef } from "react";

export function ChatInput({ onSend, onSendMedia, disabled, placeholder = "Message..." }) {
  const [text, setText] = useState("");
  const fileRef = useRef(null);

  const handleSend = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend?.(t);
    setText("");
  };

  return (
    <div className="p-2 border-t bg-white dark:bg-zinc-900 flex items-end gap-2">
      <button onClick={() => fileRef.current?.click()} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">📎</button>
      <input ref={fileRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onSendMedia?.(f); }} />
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none max-h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm outline-none"
      />
      <button onClick={handleSend} disabled={disabled || !text.trim()} className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm disabled:opacity-40">Envoyer</button>
    </div>
  );
}
