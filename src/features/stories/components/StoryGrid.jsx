import { Plus, Sparkles } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { StoryCard } from './StoryCard.jsx';

/**
 * Grille des stories.
 * - Première carte = "Créer une story" (style Instagram) si onCreate est fourni
 * - Les autres cartes ouvrent le viewer
 */
export function StoryGrid({
  stories,
  loading,
  userId,
  counts,
  onOpen,
  onCreate,
  composerOpen = false,
}) {
  if (loading) {
    return <p style={{ color: C.muted }}>Chargement…</p>;
  }

  const showCreateCard = Boolean(userId && onCreate);

  if (!showCreateCard && stories.length === 0) {
    return (
      <p className="text-sm" style={{ color: C.muted }}>
        Aucune story pour le moment.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {showCreateCard && (
        <button
          type="button"
          onClick={onCreate}
          className="text-left rounded-2xl overflow-hidden border min-h-48 p-3 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-all hover:shadow-lg relative group"
          style={{
            background: composerOpen
              ? 'linear-gradient(160deg, rgba(217,174,82,0.18), rgba(45,191,166,0.12))'
              : `linear-gradient(160deg, ${C.surface2}, ${C.surface})`,
            borderColor: composerOpen ? C.borderGold : C.border,
            color: C.ivory,
            boxShadow: composerOpen ? `0 0 0 1px ${C.goldGlow}` : undefined,
          }}
          aria-label={composerOpen ? 'Fermer le compositeur' : 'Créer une story'}
        >
          {/* Cercle style Instagram */}
          <div
            className="relative w-16 h-16 rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.teal})`,
              boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            }}
          >
            <div
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center"
              style={{ background: C.surface }}
            >
              {composerOpen ? (
                <Sparkles size={22} style={{ color: C.gold }} />
              ) : (
                <Plus size={26} strokeWidth={2.6} style={{ color: C.gold }} />
              )}
            </div>
          </div>

          <div className="text-center px-1">
            <div className="font-bold text-sm" style={{ color: C.ivory }}>
              {composerOpen ? 'Compositeur ouvert' : 'Créer une story'}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>
              {composerOpen ? 'Touche pour fermer' : 'Photo, vidéo, texte…'}
            </div>
          </div>

          {/* Liseré or discret en bas */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 opacity-80"
            style={{
              background: `linear-gradient(90deg, ${C.gold}, ${C.teal})`,
            }}
          />
        </button>
      )}

      {stories.map((s, i) => (
        <StoryCard
          key={s.id}
          story={s}
          isMine={s.author_id === userId}
          counts={counts[s.id]}
          onOpen={() => onOpen(i)}
        />
      ))}
    </div>
  );
}

export default StoryGrid;
