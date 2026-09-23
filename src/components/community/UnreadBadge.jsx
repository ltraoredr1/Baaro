import React, { memo } from 'react';
import { COLORS as THEME_COLORS } from '../../theme.js';

const FALLBACK = {
  gold: "#D9AE52",
  bg: "#0B1220",
};

function UnreadBadge({ count, isMention = false }) {
  if (!count || count <= 0) return null;

  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  const display = count > 99? '99+' : count;

  return (
    <span
      aria-label={isMention? `${display} mentions` : `${display} non lus`}
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-black rounded-full shadow-lg border border-black/20 ${
        isMention? 'animate-pulse' : ''
      }`}
      style={{
        background: isMention? '#ef4444' : C.gold,
        color: isMention? '#ffffff' : C.bg,
      }}
    >
      {display}
    </span>
  );
}

export default memo(UnreadBadge);
