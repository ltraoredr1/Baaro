import { useRef } from 'react';
import { ViewerHeader } from './ViewerHeader.jsx';
import { ViewerContent } from './ViewerContent.jsx';
import { ViewerActions } from './ViewerActions.jsx';
import { ReplyBar } from './ReplyBar.jsx';

/**
 * Visionneuse plein écran.
 * readOnly = true (highlights) : pas de réactions, réponses, stats ni suppression.
 */
export function StoryViewer({
  stories, userId, viewer, actions, cart, counts, myReactions,
  readOnly = false, onOpenEngagement, onAddHighlight, onOpenProfile, onOpenProduct,
}) {
  const videoRef = useRef(null);
  const story = viewer.currentStory;
  if (!story) return null;
  const isMine = story.author_id === userId;
  const msg = actions?.modalMsg;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none" onClick={viewer.close}>
      <div
        className="relative w-full h-full sm:w-[420px] sm:h-[85vh] sm:rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl flex flex-col justify-between border border-zinc-800/50"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => viewer.setIsPaused(true)}
        onMouseUp={() => viewer.setIsPaused(false)}
        onTouchStart={() => viewer.setIsPaused(true)}
        onTouchEnd={() => viewer.setIsPaused(false)}
      >
        {story.audio_url && <audio src={story.audio_url} autoPlay loop muted={viewer.isPaused} />}

        <ViewerHeader stories={stories} index={viewer.index} progress={viewer.progress} story={story} videoRef={videoRef} onClose={viewer.close} />
        <ViewerContent
          story={story}
          userId={userId}
          viewer={viewer}
          cart={cart}
          videoRef={videoRef}
          readOnly={readOnly}
          actions={actions}
          onOpenProfile={onOpenProfile}
          onOpenProduct={onOpenProduct}
        />

        <div className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer" onClick={viewer.previous} />
        <div className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer" onClick={viewer.next} />

        {!readOnly && actions && (
          <div className="absolute bottom-0 inset-x-0 z-30 p-4 pt-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent space-y-2">
            {msg && (
              <div className={`px-3 py-1.5 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-500/80 text-white' : 'bg-green-500/80 text-white'}`}>
                {msg.text}
              </div>
            )}
            {!isMine && <ReplyBar key={story.id} story={story} onSend={actions.reply} onPause={viewer.setIsPaused} />}
            <ViewerActions
              story={story}
              isMine={isMine}
              current={myReactions.get(story.id)}
              busy={actions.busy}
              counts={counts[story.id]}
              onReact={actions.react}
              onShare={actions.share}
              onRemove={actions.remove}
              onOpenEngagement={(type) => onOpenEngagement(type, story.id)}
              onAddHighlight={onAddHighlight}
            />
          </div>
        )}
      </div>
    </div>
  );
}
