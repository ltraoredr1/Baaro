import { useState, useEffect } from "react";
import { Search, X, User, Hash, Swords, ArrowRight, BadgeCheck } from "lucide-react";
import { COLORS } from "../theme.js";
import { STABLE_USERS } from "../data/users.js";
import { supabase } from "../supabaseClient.js";

const POPULAR_HASHTAGS = ["#GreenTech", "#BaroCoin", "#AfricaTech", "#Web3", "#P2PMesh", "#Gouvernance"];

export function GlobalSearchModal({ isOpen, onClose, onSelectUser, onSelectTab }) {
  const [query, setQuery] = useState("");
  const [supabaseUsers, setSupabaseUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Charger les utilisateurs Supabase au montage
  useEffect(() => {
    if (isOpen) {
      loadSupabaseUsers();
    }
  }, [isOpen]);

  const loadSupabaseUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*');
      
      if (error) throw error;
      setSupabaseUsers(data || []);
    } catch (error) {
      console.error("Erreur chargement utilisateurs:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Fusionner les utilisateurs stables + Supabase (sans doublons)
  const allUsers = [...STABLE_USERS];
  supabaseUsers.forEach((u) => {
    const exists = allUsers.some((su) => su.id === u.id);
    if (!exists) {
      allUsers.push({
        id: u.id,
        display_name: u.display_name || "Membre BAARO",
        handle: u.handle || "@utilisateur",
        flag: u.flag || "🌍",
        country: u.country || "🌍",
        avatar: u.avatar_url || "",
        bio: u.bio || "",
        points: u.points || 0,
        isVerified: u.is_verified || false,
        isSupabase: true // Marquer comme utilisateur Supabase
      });
    }
  });

  const filteredUsers = allUsers.filter((u) =>
    u.display_name?.toLowerCase().includes(query.toLowerCase()) ||
    u.handle?.toLowerCase().includes(query.toLowerCase()) ||
    u.country?.toLowerCase().includes(query.toLowerCase()) ||
    u.bio?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/75 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass-card rounded-3xl p-5 border shadow-2xl flex flex-col gap-4"
        style={{ borderColor: COLORS.borderGold }}
      >
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
          <Search size={18} style={{ color: COLORS.gold }} />
          <input
            type="text"
            autoFocus
            placeholder="Rechercher un membre, hashtag (#Web3), pays (🇸🇳) ou débat..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: COLORS.ivory }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ color: COLORS.muted }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Hashtags Bar */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex-shrink-0">Populaires :</span>
          {POPULAR_HASHTAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setQuery(tag)}
              className="px-2.5 py-1 rounded-xl text-xs border hover:border-amber-400/50 transition flex-shrink-0"
              style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.teal }}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {loading ? "⏳ Chargement..." : `Résultats Membres (${filteredUsers.length})`}
          </span>

          {filteredUsers.length === 0 && !loading ? (
            <div className="text-xs text-center py-6 text-slate-400">
              Aucun résultat pour "{query}"
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u.id}
                onClick={() => {
                  onClose();
                  onSelectUser(u.id);
                }}
                className="p-3 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-amber-400/50 transition"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-xs" style={{ borderColor: COLORS.borderGold, background: COLORS.surface2 }}>
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">{u.flag || "🌍"}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1" style={{ color: COLORS.ivory }}>
                      {u.display_name} {u.flag}
                      {u.isVerified && <BadgeCheck size={14} style={{ color: COLORS.teal }} />}
                      {u.isSupabase && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-normal">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="text-[11px]" style={{ color: COLORS.muted }}>{u.handle} • {u.country || "🌍"}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold" style={{ color: COLORS.gold }}>{u.points || 0} pts</span>
                  <ArrowRight size={14} style={{ color: COLORS.muted }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
            }
