import { useEffect, useMemo, useState } from "react";
import { Bookmark, Clock3, Heart, Loader2, MessageCircle, Play, Repeat2, Share2, X } from "lucide-react";
import { supabase } from "../../../supabaseClient.js";

const FILTERS = [
  ["all", "Tout"], ["watched", "Regardées"], ["liked", "Aimées"],
  ["shared", "Partagées"], ["commented", "Commentées"],
  ["saved", "Favoris"], ["reposted", "Reposts"],
];
const VIDEO = "id,title,description,video_url,thumbnail_url,created_at,author_id,profiles:author_id(handle,display_name,avatar_url)";
const joined = `video_id,created_at,videos:video_id(${VIDEO})`;

async function rows(query) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn("[VideoHistory]", error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn("[VideoHistory]", error);
    return [];
  }
}

export default function VideoActivityHistory({ user, onClose, onOpenVideo }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      const [watched, liked, shared, commented, saved, reposted] = await Promise.all([
        rows(supabase.from("video_watch_events")
          .select(`video_id,updated_at,created_at,videos:video_id(${VIDEO})`)
          .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(200)),
        rows(supabase.from("video_likes").select(joined)
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)),
        rows(supabase.from("video_shares").select(joined)
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)),
        rows(supabase.from("video_comments")
          .select(`id,video_id,content,created_at,videos:video_id(${VIDEO})`)
          .eq("author_id", user.id).order("created_at", { ascending: false }).limit(200)),
        rows(supabase.from("video_bookmarks").select(joined)
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)),
        rows(supabase.from("videos").select(VIDEO)
          .eq("author_id", user.id).eq("is_repost", true)
          .order("created_at", { ascending: false }).limit(200)),
      ]);

      const mapped = [
        ...watched.map(x => ({ id: `w-${x.video_id}`, type: "watched", date: x.updated_at || x.created_at, video: x.videos })),
        ...liked.map(x => ({ id: `l-${x.video_id}`, type: "liked", date: x.created_at, video: x.videos })),
        ...shared.map(x => ({ id: `s-${x.video_id}`, type: "shared", date: x.created_at, video: x.videos })),
        ...commented.map(x => ({ id: `c-${x.id}`, type: "commented", date: x.created_at, video: x.videos, detail: x.content })),
        ...saved.map(x => ({ id: `b-${x.video_id}`, type: "saved", date: x.created_at, video: x.videos })),
        ...reposted.map(x => ({ id: `r-${x.id}`, type: "reposted", date: x.created_at, video: x })),
      ].filter(x => x.video?.id);

      mapped.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      if (!cancelled) {
        setItems(mapped);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const visible = useMemo(
    () => filter === "all" ? items : items.filter(x => x.type === filter),
    [items, filter]
  );

  const labels = {
    watched: "Vidéo regardée", liked: "Vidéo aimée",
    shared: "Vidéo partagée", commented: "Commentaire publié",
    saved: "Vidéo enregistrée", reposted: "Vidéo repostée",
  };
  const icons = {
    watched: Clock3, liked: Heart, shared: Share2,
    commented: MessageCircle, saved: Bookmark, reposted: Repeat2,
  };

  const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <section className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 text-white sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <h2 className="text-base font-black">Historique vidéo</h2>
            <p className="mt-1 text-xs text-white/50">Toutes tes activités, de la plus récente à la plus ancienne</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-3 [scrollbar-width:none]">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${filter === id ? "bg-red-500 text-white" : "bg-white/10 text-white/70"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center gap-2 py-14 text-sm text-white/60">
              <Loader2 size={18} className="animate-spin" /> Chargement…
            </div>
          ) : visible.length === 0 ? (
            <p className="py-14 text-center text-sm text-white/50">Aucune activité dans cette catégorie.</p>
          ) : (
            <div className="space-y-2">
              {visible.map(item => {
                const video = item.video;
                const Icon = icons[item.type] || Clock3;
                const creator = video.profiles?.handle
                  ? `@${video.profiles.handle.replace(/^@/, "")}`
                  : video.profiles?.display_name || "Créateur BAARO";
                return (
                  <button key={item.id} type="button" onClick={() => onOpenVideo?.(video)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left hover:bg-white/10">
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                      {video.thumbnail_url
                        ? <img src={video.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <div className="flex h-full items-center justify-center text-white/40"><Play size={22} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-300">
                        <Icon size={13} /> {labels[item.type]}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold">{video.title || video.description || "Vidéo BAARO"}</p>
                      <p className="mt-1 truncate text-[11px] text-white/45">{creator} · {dateLabel(item.date)}</p>
                      {item.detail && <p className="mt-1 line-clamp-1 text-[11px] text-white/60">« {item.detail} »</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
