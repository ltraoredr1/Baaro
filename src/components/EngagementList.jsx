import { useEffect, useState } from "react";
import { X, Eye, Heart } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";

const RPCS = {
  storyViews: "get_story_viewers",
  storyLikes: "get_story_reactors",
  videoViews: "get_video_viewers",
  videoLikes: "get_video_likers",
  postViews: "get_post_viewers",
  postLikes: "get_post_likers",
};

export function EngagementList({ type, targetId, ownerId, viewerId, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!targetId || !ownerId || ownerId !== viewerId) {
      setLoading(false);
      setError("Accès réservé au propriétaire");
      return undefined;
    }
    (async () => {
      setLoading(true);
      const rpc = RPCS[type];
      if (!rpc) { setError("Type inconnu"); setLoading(false); return; }
      const argName = type.startsWith("story") ? "p_story_id" : type.startsWith("video") ? "p_video_id" : "p_post_id";
      const { data, error: rpcError } = await supabase.rpc(rpc, { [argName]: targetId });
      if (!active) return;
      if (rpcError) setError(rpcError.message || "Impossible de charger la liste");
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [type, targetId, ownerId, viewerId]);

  const isViews = type.toLowerCase().includes("views");
  const title = isViews ? "Personnes qui ont vu" : "Personnes qui ont aimé";

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md max-h-[78dvh] rounded-3xl border overflow-hidden" style={{ background: COLORS.surface, borderColor: COLORS.borderGold, color: COLORS.ivory }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-2 font-black"><span className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: COLORS.surface2 }}>{isViews ? <Eye size={17} /> : <Heart size={17} />}</span>{title}</div>
          <button onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-3 space-y-2">
          {loading && <p className="text-sm p-4" style={{ color: COLORS.muted }}>Chargement…</p>}
          {!loading && error && <p className="text-sm p-4 text-red-300">{error}</p>}
          {!loading && !error && !rows.length && <p className="text-sm p-4" style={{ color: COLORS.muted }}>Aucune personne pour le moment.</p>}
          {!loading && !error && rows.map((row) => (
            <div key={`${row.viewer_id || row.user_id}-${row.viewed_at || row.created_at || row.reaction || "x"}`} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ borderColor: COLORS.border, background: COLORS.surface2 }}>
              <div className="h-10 w-10 rounded-full overflow-hidden border flex items-center justify-center shrink-0" style={{ borderColor: COLORS.borderGold }}>
                {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" /> : <span style={{ color: COLORS.gold }}>{row.display_name?.charAt(0) || "?"}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm truncate">{row.display_name || "Membre BAARO"}</div>
                <div className="text-[11px] truncate" style={{ color: COLORS.muted }}>@{row.handle || "membre"}</div>
              </div>
              {row.flag && <span>{row.flag}</span>}
              {row.reaction && <span className="text-lg">{row.reaction}</span>}
              {(row.viewed_at || row.created_at) && <span className="text-[9px] shrink-0" style={{ color: COLORS.muted }}>{new Date(row.viewed_at || row.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
