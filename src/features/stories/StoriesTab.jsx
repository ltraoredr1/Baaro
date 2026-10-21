
 // Orchestrateur : branche les hooks sur les composants. Aucune logique métier ici.
import { useCallback, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { COLORS as C } from '../../theme.js';
import { ConnectionStatus } from '../../components/ConnectionStatus.jsx';
import { FutureModulePanel } from '../../components/FutureModulePanel.jsx';
import { EngagementList } from '../../components/EngagementList.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

import { productRoute } from './constants.js';
import { recordStoryView } from './api/storiesApi.js';
import { useStories } from './hooks/useStories.js';
import { useStoryViewer } from './hooks/useStoryViewer.js';
import { useStoryActions } from './hooks/useStoryActions.js';
import { useStoryComposer } from './hooks/useStoryComposer.js';
import { useMyProducts } from './hooks/useMyProducts.js';
import { useCartQuantities } from './hooks/useCartQuantities.js';
import { useHighlights } from './hooks/useHighlights.js';
import { useScheduledStories } from './hooks/useScheduledStories.js';
import { useProductStats } from './hooks/useProductStats.js';

import { CreateFab } from './components/CreateFab.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { StoryComposer } from './components/StoryComposer.jsx';
import { ScheduledList } from './components/ScheduledList.jsx';
import { HighlightsRow } from './components/HighlightsRow.jsx';
import { HighlightPicker } from './components/HighlightPicker.jsx';
import { ProductStatsPanel } from './components/ProductStatsPanel.jsx';
import { StoryGrid } from './components/StoryGrid.jsx';
import { StoryViewer } from './components/StoryViewer.jsx';

/**
 * Props :
 *  - id             : id de l'utilisateur connecté
 *  - onOpenProfile  : (userId, handle) => void (mentions)
 *  - onOpenProduct  : (product, { storyId, buy }) => void
 *                     (sinon navigation vers productRoute())
 */
export function StoriesTab({ id, onOpenProfile, onOpenProduct }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [engagement, setEngagement] = useState(null);
  const [highlightTarget, setHighlightTarget] = useState(null);
  const [showStats, setShowStats] = useState(false);

  const data = useStories(id, setError);
  const products = useMyProducts(id);
  const cart = useCartQuantities();
  const highlights = useHighlights(id);
  const scheduled = useScheduledStories(id);
  const stats = useProductStats(showStats && !!id);

  const openProduct = useCallback(
    (product, opts) => {
      if (onOpenProduct) {
        onOpenProduct(product, opts);
      } else {
        window.location.assign(productRoute(product.id, opts));
      }
    },
    [onOpenProduct]
  );

  const viewer = useStoryViewer(data.stories, async (s) => {
    actions.clearMsg();

    if (s.author_id === id) {
      data.loadCounts(s.id);
    } else if (id) {
      await recordStoryView(s.id);
    }
  });

  const actions = useStoryActions({
    userId: id,
    toggleReaction: data.toggleReaction,
    removeStory: data.removeStory,
    onRemoved: viewer.close,
  });

  const composer = useStoryComposer({
    userId: id,
    setError,
    onCreated: ({ scheduledAt } = {}) => {
      data.reload();
      scheduled.reload();

      if (scheduledAt) {
        setNotice(
          'Story programmée pour le ' +
            new Date(scheduledAt).toLocaleString([], {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
        );
      }
    },
  });

  const toggleComposer = () => {
    const next = !composer.isOpen;
    composer.setIsOpen(next);

    if (next) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-4 relative">
      <ConnectionStatus />

      <div className="flex items-start justify-between">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: C.ivory }}
          >
            Stories
          </h2>
          <p
            className="text-xs"
            style={{ color: C.muted }}
          >
            24 h · texte, média, produit, sondage, stickers et musique
          </p>
        </div>

        {id && (
          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs"
            style={{
              borderColor: C.border,
              color: showStats ? C.gold : C.ivory,
            }}
          >
            <BarChart3 size={14} />
            Stats boutique
          </button>
        )}
      </div>

      {id && (
        <CreateFab
          isOpen={composer.isOpen}
          onToggle={toggleComposer}
        />
      )}

      <ErrorBanner
        message={error}
        onClose={() => setError('')}
      />

      <ErrorBanner
        tone="ok"
        message={notice}
        onClose={() => setNotice('')}
      />

      {composer.isOpen && (
        <StoryComposer
          composer={composer}
          products={products}
          cart={cart}
        />
      )}

      {showStats && (
        <ProductStatsPanel
          stats={stats}
          products={products}
        />
      )}

      <ScheduledList
        items={scheduled.items}
        onCancel={scheduled.cancel}
      />

      {id && (
        <HighlightsRow
          highlights={highlights}
          userId={id}
          canManage
          onOpenProduct={openProduct}
          onOpenProfile={onOpenProfile}
        />
      )}

      <StoryGrid
        stories={data.stories}
        loading={data.loading}
        userId={id}
        counts={data.counts}
        onOpen={viewer.open}
      />

      <FutureModulePanel
        moduleId="stories_ia_filters"
        onNavigate={(m, a) =>
          console.log('Navigation futur module:', m, a)
        }
      />

      <StoryViewer
        stories={data.stories}
        userId={id}
        viewer={viewer}
        actions={actions}
        cart={cart}
        counts={data.counts}
        myReactions={data.myReactions}
        onOpenEngagement={(type, storyId) =>
          setEngagement({ type, id: storyId })
        }
        onAddHighlight={setHighlightTarget}
        onOpenProfile={onOpenProfile}
        onOpenProduct={openProduct}
      />

      {highlightTarget && (
        <HighlightPicker
          story={highlightTarget}
          highlights={highlights}
          onClose={() => setHighlightTarget(null)}
        />
      )}

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={viewer.currentStory?.author_id || id}
          viewerId={id}
          onClose={() => setEngagement(null)}
        />
      )}

      <ConfirmDialog
        open={!!actions.pendingRemoval}
        title="Supprimer cette story ?"
        message="Cette action est irréversible. Veux-tu vraiment supprimer cette story ?"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={actions.confirmRemove}
        onCancel={actions.cancelRemove}
      />
    </div>
  );
}

export default StoriesTab;
