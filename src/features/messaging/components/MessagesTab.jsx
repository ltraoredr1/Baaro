/**
 * src/features/messaging/components/MessagesTab.jsx
 * Liste des conversations BAARO - déplacé depuis src/components/
 */
import React, { useState } from "react";
import { useConversations } from "../hooks/useConversations.js";
import { MessageBubble } from "./MessageBubble.jsx";

export function MessagesTab({ currentUserId, onSelectConversation, selectedId }) {
  const { conversations, loading } = useConversations(currentUserId);
  const [search, setSearch] = useState("");

  const filtered = conversations.filter(c => {
    const name = c.participants?.[0]?.profiles?.display_name || c.group_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <div className="p-4 text-sm opacity-60">Chargement conversations...</div>;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      <div className="p-3 border-b">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="w-full px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && <div className="p-6 text-center text-sm opacity-50">Aucune conversation</div>}
        {filtered.map(conv => {
          const other = conv.participants?.[0]?.profiles;
          const isSelected = selectedId === conv.id;
          return (
            <button
              key={conv.id}
              onClick={() => onSelectConversation?.(conv)}
              className={`w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left ${isSelected ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
            >
              <img src={other?.avatar_url || `https://i.pravatar.cc/100?u=${conv.id}`} alt="" className="w-11 h-11 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <span className="font-medium text-sm truncate">{other?.display_name || conv.group_name || "Conversation"}</span>
                  <span className="text-[11px] opacity-50">{conv.lastMessage ? new Date(conv.lastMessage.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ""}</span>
                </div>
                <p className="text-xs opacity-60 truncate">{conv.lastMessage?.content?.slice(0,60) || "Nouvelle conversation"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
