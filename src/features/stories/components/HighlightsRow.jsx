import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { highlightToStories } from '../api/highlightsApi.js';
import { useStoryViewer } from '../hooks/useStoryViewer.js';
import { useCartQuantities } from '../hooks/useCartQuantities.js';
import { StoryViewer } from './StoryViewer.jsx';

/**
 * Rangée de highlights. `highlights` = valeur de useHighlights(ownerId).
 * Réutilisable sur une page profil :  <HighlightsRow highlights={useHighlights(profileId)} userId={me} />
 */
export function HighlightsRow({ highlights, userId, canManage = false, onOpenProduct, onOpenProfile }) {
  const { list, owner, remove } = highlights;
  const cart = useCartQuantities();
  const [req, setReq] = useState(null);
  const opened = list.find((h) => h.id === req?.id);
  const items = useMemo(() => highlightToStories(opened, owner), [opened, owner]);
  const viewer = useStoryViewer(items);

  useEffect(() => { if (req) viewer.open(0); /* eslint-disable-next-line */ }, [req]);

  if (!list.length) return null;

  const closeAll = () => { viewer.close(); setReq(null); };

  const confirmRemove = async (h) => {
    if (!window.confirm(`Supprimer « ${h.title} » ?`)) return;
    try { await remove(h.id); } catch (e) { window.alert('Suppression impossible : ' + (e.message || 'erreur')); }
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {list.map((h) => (
          <div key={h.id} className="relative shrink-0 w-16 text-center">
            <button onClick={() => setReq({ id: h.id, n: Date.now() })} className="block w-16" aria-label={`Ouvrir ${h.title}`}>
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 flex items-center justify-center text-xl" style={{ borderColor: C.gold || '#f59e0b', background: C.surface }}>
                {h.cover_url ? <img src={h.cover_url} alt="" className="w-full h-full object-cover" /> : <span>⭐</span>}
              </div>
              <div className="mt-1 text-[11px] truncate" style={{ color: C.ivory }}>{h.title}</div>
            </button>
            {canManage && (
              <button onClick={() => confirmRemove(h)} aria-label="Supprimer le highlight" className="absolute -top-1 -right-1 p-0.5 rounded-full bg-black/70 text-white">
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      <StoryViewer
        stories={items}
        userId={userId}
        viewer={{ ...viewer, close: closeAll }}
        actions={null}
        cart={cart}
        counts={{}}
        myReactions={new Map()}
        readOnly
        onOpenProduct={onOpenProduct}
        onOpenProfile={onOpenProfile}
      />
    </>
  );
}
