import { Clapperboard, GitBranch, MessageCircleReply, Split } from "lucide-react";

/**
 * Badge collab sur une VideoCard (Stitch / Duo / Reply).
 */
export default function CollabBadge({ video, onOpenSource }) {
  if (!video) return null;

  const mode = video.collab_mode;
  if (!mode) return null;

  const map = {
    stitch: {
      label: "STITCH",
      icon: GitBranch,
      className: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",
    },
    duo: {
      label: "DUO",
      icon: Split,
      className: "text-violet-300 border-violet-400/30 bg-violet-400/10",
    },
    reply: {
      label: "RÉPONSE",
      icon: MessageCircleReply,
      className: "text-amber-300 border-amber-400/30 bg-amber-400/10",
    },
  };

  const cfg = map[mode] || {
    label: mode.toUpperCase(),
    icon: Clapperboard,
    className: "text-white/70 border-white/20 bg-black/40",
  };
  const Icon = cfg.icon;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenSource?.(video);
      }}
      className={`absolute top-28 left-4 z-20 px-3 py-1.5 rounded-full backdrop-blur-md border text-[10px] font-black flex items-center gap-1.5 ${cfg.className}`}
    >
      <Icon size={12} />
      {cfg.label}
    </button>
  );
}
