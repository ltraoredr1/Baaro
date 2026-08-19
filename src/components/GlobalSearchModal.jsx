import { useState, useEffect } from "react";
import { Search, X, User, Hash, Swords, ArrowRight, BadgeCheck } from "lucide-react";
import { COLORS } from "../theme.js";
import { STABLE_USERS } from "../data/users.js";
import { supabase } from "../supabaseClient.js";

const POPULAR_HASHTAGS = ["#GreenTech", "#BaroCoin", "#AfricaTech", "#Web3", "#P2PMesh", "#Gouvernance"];

export function GlobalSearchModal({ isOpen, onClose, onSelectUser, onSelectDebate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ users: [], debates: [] });
  const [loading, setLoading] = useState(false);

  // Réinitialiser la recherche quand la modale s'ouvre ou se ferme
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults({ users: [], debates: [] });
    }
  }, [isOpen]);

  // Recherche optimisée avec debounce (anti-rebond) et double table sécurisée
  useEffect(() => {
    if (!isOpen || !query || query.trim().length < 2) {
      // Si la requête est trop courte, on affiche juste les STABLE_USERS filtrés
      const filteredStable = STABLE_USERS.filter((u) =>
        u.display_name?.toLowerCase().includes(query.toLowerCase()) ||
        u.handle?.toLowerCase().includes(query.toLowerCase())
      );
      setResults({ users: filteredStable, debates: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const searchQuery = `%${query.trim()}%`;

      try {
        // 1. Recherche sécurisée dans la table 'profiles'
        let profileUsers = [];
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, handle, flag, country, avatar_url, bio, points, is_verified')
            .or(`display_name.ilike.${searchQuery},handle.ilike.${searchQuery},country.ilike.${searchQuery}`)
            .limit(10);
          if (!error) profileUsers = data || [];
        } catch (e) {
          console.warn("Table 'profiles' non trouvée ou erreur, on continue.");
        }

        // 2. Recherche des débats actifs
        let dbDebates = [];
        try {
          const { data, error } = await supabase
            .from('debate_rooms')
            .select('id, title, topic, invite_code, status')
            .eq('status', 'active')
            .or(`title.ilike.${searchQuery},topic.ilike.${searchQuery}`)
            .limit(5);
          if (!error) dbDebates = data || [];
        } catch (e) {
          console.warn("Table 'debate_rooms' non trouvée ou erreur.");
        }

        // 3. Fusion intelligente et dédoublonnage
        const filteredStable = STABLE_USERS.filter((u) =>
          u.display_name?.toLowerCase().includes(query.toLowerCase()) ||
          u.handle?.toLowerCase().includes(query.toLowerCase())
        );

        const seenIds = new Set();
        const finalUsers = [...filteredStable];
        
        // On marque les IDs déjà présents pour éviter les doublons
        filteredStable.forEach(u => seenIds.add(u.id));

        // Fonction pour ajouter un utilisateur sans créer de doublon
        const addUserSafely = (u) => {
          const uid = u.user_id || u.id; // Priorité à user_id si existe (cas de profiles)
          if (uid && !seenIds.has(uid)) {
            seenIds.add(uid);
            finalUsers.push({
              id: uid,
              display_name: u.display_name || "Membre BAARO",
              handle: u.handle || "@utilisateur",
              flag: u.flag || "🌍",
              country: u.country || "🌍",
              avatar: u.avatar_url || "",
              bio: u.bio || "",
              points: u.points || 0,
              isVerified: u.is_verified || false,
              isSupabase: true
            });
          }
        };

        // On ajoute les profils réels sans dépendre d'une table `users` inexistante.
        profileUsers.forEach(addUserSafely);

        setResults({ users: finalUsers, debates: dbDebates });

      } catch (error) {
        console.error("Erreur critique recherche:", error);
      } finally {
        setLoading(false);
      }
    }, 300); // Délai de 300ms pour éviter de spammer la base de données

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

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
            <button onClick={() => setQuery("")} style={{ color: COLORS.muted }} className="hover:text-white transition-colors">
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

        {/* Results Container */}
        <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
          
          {/* Section Utilisateurs */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
              <User size={14} />
              {loading && query.length >= 2 ? "⏳ Recherche en cours..." : `Membres (${results.users.length})`}
            </span>

            {results.users.length === 0 && query.length >= 2 && !loading ? (
              <div className="text-xs text-center py-4 text-slate-400 italic">Aucun membre trouvé</div>
            ) : (
              <div className="flex flex-col gap-2">
                {results.users.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      onClose();
                      if (onSelectUser) onSelectUser(u.id);
                    }}
                    className="p-3 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-amber-400/50 transition group"
                    style={{ background: COLORS.surface, borderColor: COLORS.border }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-xs shrink-0" style={{ borderColor: COLORS.borderGold, background: COLORS.surface2 }}>
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.display_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">{u.flag || "🌍"}</span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5" style={{ color: COLORS.ivory }}>
                          {u.display_name} {u.flag}
                          {u.isVerified && <BadgeCheck size={14} style={{ color: COLORS.teal }} />}
                          {u.isSupabase && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-normal border border-blue-500/30">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: COLORS.muted }}>{u.handle} • {u.country || "🌍"}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                      <span className="text-xs font-mono font-bold" style={{ color: COLORS.gold }}>{u.points || 0} pts</span>
                      <ArrowRight size={14} style={{ color: COLORS.muted }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section Débats (séparée par une ligne si des utilisateurs sont affichés) */}
          {results.debates.length > 0 && (
            <div className="border-t pt-4" style={{ borderColor: COLORS.border }}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
                <Swords size={14} />
                Débats Actifs ({results.debates.length})
              </span>
              
              <div className="flex flex-col gap-2">
                {results.debates.map((debate) => (
                  <div
                    key={debate.id}
                    onClick={() => {
                      onClose();
                      if (onSelectDebate) onSelectDebate(debate.invite_code);
                    }}
                    className="p-3 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-green-400/50 transition group"
                    style={{ background: COLORS.surface, borderColor: COLORS.border }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${COLORS.teal}20`, color: COLORS.teal }}>
                        <Hash size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-bold" style={{ color: COLORS.ivory }}>
                          {debate.title}
                        </div>
                        <div className="text-[11px]" style={{ color: COLORS.muted }}>
                          {debate.topic}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-green-500/20 text-green-400">
                        REJOINDRE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
