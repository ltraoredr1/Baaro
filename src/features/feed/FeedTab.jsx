//... garde tout ton code, ajoute juste au dessus du return:

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff/60000);
  const h = Math.floor(diff/3600000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m}min`;
  if (h < 24) return `Il y a ${h}h`;
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
};

// Et dans le map:
<div className="flex gap-1.5 items-center">
  <span className="font-bold text-[15px]" style={{color: COLORS.ivory}}>{p?.display_name}</span>
  <span className="text-[13px]" style={{color: COLORS.muted}}>@{p?.handle}</span>
  <span className="text-[11px] opacity-70" style={{color: COLORS.muted}}>· {formatDate(post.created_at)}</span>
</div>
