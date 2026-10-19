/**
 * src/features/messaging/components/MessageBubble.jsx
 */
import React from "react";

export function MessageBubble({ message, isMe, onRetry }) {
  const isExpired = message.expired;
  const isMedia = message.type && message.type !== "text" && message.media_url;
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} px-3 py-1`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-zinc-100 dark:bg-zinc-800 rounded-bl-sm'} ${isExpired ? 'opacity-50 italic' : ''}`}>
        {isMedia ? (
          message.type === "image" ? <img src={message.media_url} alt="" className="rounded-lg max-w-full" /> :
          message.type === "video" ? <video src={message.media_url} controls className="rounded-lg max-w-full" /> :
          <a href={message.media_url} target="_blank" rel="noreferrer" className="underline">{message.type} - ouvrir</a>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.plaintext || message.content || "[Chiffré]"}</p>
        )}
        <div className={`text-[10px] mt-1 flex gap-1 ${isMe ? 'text-white/70 justify-end' : 'opacity-50'}`}>
          <span>{time}</span>
          {message.failed && <button onClick={() => onRetry?.(message)} className="underline">Réessayer</button>}
        </div>
      </div>
    </div>
  );
}
