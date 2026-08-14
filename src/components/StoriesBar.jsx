import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Plus } from "lucide-react";
import { COLORS } from "../theme.js";

/**
 * BAARO — Barre de stories (chargement robuste, sans jointure FK fragile)
 * Remplace : src/components/StoriesBar.jsx
 */
export function StoriesBar({ onOpenStory, onCreateStory, refreshKey = 0 }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      const { data, error: qErr } = await supabase
        .from("stories")
        .select(
          "id, media_url, media_type, text_overlay, created_at, author_id, expires_at"
        )
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(100);

      if (qErr) throw qErr;

      const rows = (data || []).filter((s) => s.media_url);
      console.log("[BAARO] stories actives:", rows.length);

      const authorIds = [...new Set(rows.map((s) => s.author_id).filter(Boolean))];
      let profileMap = {};
      if (authorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, flag, avatar_url")
          .in("user_id", authorIds);
        (profiles || []).forEach((p) => {
          profileMap[p.user_id] = p;
        });
      }

      const map = {};
      rows.forEach((s) => {
        if (!map[s.author_id]) {
          map[s.author_id] = {
            authorId: s.author_id,
            author: profileMap[s.author_id] || {
              display_name: "Membre",
              handle: "membre",
              flag: "🌍",
            },
            stories: [],
          };
        }
        map[s.author_id].stories.push(s);
      });

      const groupsArr = Object.values(map);
      console.log("[BAARO] groupes:", groupsArr.length);
      setGroups(groupsArr);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur stories");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories, refreshKey]);

  if (loading) {
    return (
      <div className="flex gap-3 px-3 py-3 min-h-[100px]">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-16 h-16 rounded-full bg-white/10 animate-pulse shrink-0"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="px-3 text-[10px] text-amber-400 truncate">⚠️ {error}</p>
      )}
      <div className="flex gap-3 overflow-x-auto px-3 py-3 min-h-[100px] no-scrollbar">
        {/* Créer sa story */}
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
          <span className="text-[11px] font-semibold text-yellow-400">
            Ta story
          </span>
        </button>

        {groups.length === 0 && !error && (
          <div className="flex items-center text-xs text-gray-500 px-2">
            Aucune story active
          </div>
        )}

        {groups.map((g) => (
          <button
            key={g.authorId}
            onClick={() => onOpenStory?.(g)}
            className="flex-shrink-0 flex flex-col items-center gap-1.5"
          >
            <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500">
              <div className="w-full h-full rounded-full overflow-hidden border-2 border-black bg-gray-800 flex items-center justify-center text-xl">
                {g.author?.avatar_url ? (
                  <img
                    src={g.author.avatar_url}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                ) : (
                  g.author?.flag || "🌍"
                )}
              </div>
            </div>
            <span className="text-[10px] text-gray-300 max-w-[64px] truncate">
              {g.author?.handle || g.author?.display_name || "membre"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
