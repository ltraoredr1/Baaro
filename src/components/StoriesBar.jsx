import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Plus } from "lucide-react";
import { COLORS } from "../theme.js";

export function StoriesBar({ onOpenStory, onCreateStory }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("stories")
          .select(`
            id, media_url, media_type, text_overlay, filter_used, created_at, author_id,
            profiles:author_id (display_name, handle, flag, avatar_url)
          `)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });

        const map = {};
        (data || []).forEach((s) => {
          if (!map[s.author_id]) {
            map[s.author_id] = {
              authorId: s.author_id,
              author: s.profiles,
              stories: [],
            };
          }
          map[s.author_id].stories.push(s);
        });
        setGroups(Object.values(map));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="h-24 mx-3 rounded-xl bg-white/5 animate-pulse" />;
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-3 py-3 no-scrollbar">
      <button
        onClick={onCreateStory}
        className="flex-shrink-0 flex flex-col items-center gap-1.5"
      >
        <div
          className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center"
          style={{ borderColor: COLORS.gold }}
        >
          <Plus size={22} style={{ color: COLORS.gold }} />
        </div>
        <span className="text-[10px] text-gray-300">Ta story</span>
      </button>

      {groups.map((g) => (
        <button
          key={g.authorId}
          onClick={() => onOpenStory(g)}
          className="flex-shrink-0 flex flex-col items-center gap-1.5"
        >
          <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500">
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-black bg-gray-800">
              {g.author?.avatar_url ? (
                <img
                  src={g.author.avatar_url}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">
                  {g.author?.flag || "🌍"}
                </div>
              )}
            </div>
          </div>
          <span className="text-[10px] text-gray-300 truncate w-16 text-center">
            {g.author?.handle || "membre"}
          </span>
        </button>
      ))}
    </div>
  );
}
