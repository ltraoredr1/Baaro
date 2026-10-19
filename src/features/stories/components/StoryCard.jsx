import { COLORS as C } from '../../../theme.js';
import { StoryCard } from './StoryCard.jsx';

export function StoryGrid({ stories, loading, userId, counts, onOpen }) {
  if (loading) return <p style={{ color: C.muted }}>Chargement…</p>;
  if (stories.length === 0) return <p className="text-sm" style={{ color: C.muted }}>Aucune story pour le moment.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stories.map((s, i) => (
        <StoryCard key={s.id} story={s} isMine={s.author_id === userId} counts={counts[s.id]} onOpen={() => onOpen(i)} />
      ))}
    </div>
  );
}
