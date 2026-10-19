/**
 * Orchestrateur : branche les hooks sur les composants. Aucune logique métier ici.
 */
import { useState } from 'react';
import { COLORS as C } from '../../theme.js';
import { ConnectionStatus } from '../../components/ConnectionStatus.jsx';
import { FutureModulePanel } from '../../components/FutureModulePanel.jsx';
import { EngagementList } from '../../components/EngagementList.jsx';

import { recordStoryView } from './api/storiesApi.js';
import { useStories } from './hooks/useStories.js';
import { useStoryViewer } from './hooks/useStoryViewer.js';
import { useStoryActions } from './hooks/useStoryActions.js';
import { useStoryComposer } from './hooks/useStoryComposer.js';
import { useMyProducts } from './hooks/useMyProducts.js';
import { useCartQuantities } from './hooks/useCartQuantities.js';

import { CreateFab } from './components/CreateFab.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { StoryComposer } from './components/StoryComposer.jsx';
import { StoryGrid } from './components/StoryGrid.jsx';
import { StoryViewer } from './components/StoryViewer.jsx';

export function StoriesTab({ id }) {
  const [error, setError] = useState('');
  const [engagement, setEngagement] = useState(null);

  const data = useStories(id, setError);
  const products = useMyProducts(id);
  const cart = useCartQuantities();

  const viewer = useStoryViewer(data.stories, async (s) => {
    actions.clearMsg();
    if (s.author_id === id) data.loadCounts(s.id);
    else if (id) await recordStoryView(s.id);
  });

  const actions = useStoryActions({
    userId: id,
    toggleLike: data.toggleLike,
    removeStory: data.removeStory,
    onRemoved: viewer.close,
  });

  const composer = useStoryComposer({ userId: id, setError, onCreated: () => data.reload() });

  const toggleComposer = () => {
    const next = !composer.isOpen;
    composer.setIsOpen(next);
    if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4 relative">
      <ConnectionStatus />

      <div>
        <h2 className="text-xl font-bold" style={{ color: C.ivory }}>Stories</h2>
        <p className="text-xs" style={{ color: C.muted }}>24 h · texte, média, produit, sondage et musique</p>
      </div>

      {id && <CreateFab isOpen={composer.isOpen} onToggle={toggleComposer} />}
      <ErrorBanner message={error} onClose={() => setError('')} />
      {composer.isOpen && <StoryComposer composer={composer} products={products} cart={cart} />}

      <StoryGrid stories={data.stories} loading={data.loading} userId={id} counts={data.counts} onOpen={viewer.open} />

      <FutureModulePanel moduleId="stories_ia_filters" onNavigate={(m, a) => console.log('Navigation futur module:', m, a)} />

      <StoryViewer
        stories={data.stories}
        userId={id}
        viewer={viewer}
        actions={actions}
        cart={cart}
        counts={data.counts}
        myLikes={data.myLikes}
        onOpenEngagement={(type, storyId) => setEngagement({ type, id: storyId })}
      />

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={viewer.currentStory?.author_id || id}
          viewerId={id}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default StoriesTab;
