import React, { memo } from "react";
import { MessageSquare, Volume2, Megaphone } from "lucide-react";
import { COLORS as THEME_COLORS } from "../../theme.js";
import UnreadBadge from "./UnreadBadge.jsx";

const FALLBACK = {
  gold: "#D9AE52",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
  bg: "#0B1220",
  teal: "#2DBFA6",
};

function ChannelItem({
  channel,
  isActive,
  unreadCount = 0,
  lastMessage,
  onSelect,
}) {
  if (!channel) return null;

  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const isVoice = channel.type === "voice";
  const isAnnounce = channel.type === "announce";

  const Icon = isVoice ? Volume2 : isAnnounce ? Megaphone : MessageSquare;
  const typeLabel = isVoice ? "Vocal" : isAnnounce ? "Annonces" : "Texte";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(channel)}
      aria-current={isActive ? "true" : undefined}
      aria-label={`${typeLabel} ${channel.name}${
        unreadCount > 0 ? `, ${unreadCount} non lus` : ""
      }`}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-left group transition-all duration-200 hover:scale-[1.01] ${
        isActive ? "shadow-md border" : "hover:bg-white/[0.04]"
      }`}
      style={{
        background: isActive ? "rgba(251,191,36,0.12)" : "transparent",
        borderColor: isActive ? "rgba(251,191,36,0.3)" : "transparent",
        color: isActive ? C.gold : C.ivory,
      }}
    >
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
        style={{
          background: isActive
            ? `linear-gradient(135deg, ${C.gold}, #ff8c42)`
            : "rgba(255,255,255,0.06)",
          color: isActive ? C.bg : C.muted,
        }}
      >
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={`text-[13.5px] truncate ${
              unreadCount > 0 ? "font-black text-white" : "font-bold"
            }`}
          >
            {isAnnounce ? "" : isVoice ? "" : "#"}
            {channel.name}
          </span>
          {lastMessage?.time && (
            <span className="text-[10px] shrink-0" style={{ color: C.muted }}>
              {lastMessage.time}
            </span>
          )}
        </div>

        {lastMessage?.text && !isVoice && (
          <p
            className="text-[11px] truncate font-medium opacity-70"
            style={{ color: C.muted }}
          >
            {lastMessage.sender ? `${lastMessage.sender}: ` : ""}
            {lastMessage.text}
          </p>
        )}
        {isAnnounce && !lastMessage?.text && (
          <p className="text-[10px]" style={{ color: C.muted }}>
            Canal d&apos;annonces
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1.5">
        <UnreadBadge count={unreadCount} />
        {isActive && unreadCount === 0 && (
          <div
            className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}

export default memo(ChannelItem);
