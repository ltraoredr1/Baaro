import { useEffect } from 'react';
import { PollDisplay } from '../../../components/PollDisplay.jsx';
import ProductCard from '../../../components/ProductCard.jsx';
import { RichTextRenderer } from '../../../components/RichTextRenderer.jsx';
import { TranslateButton } from '../../../components/TranslateButton.jsx';
import { AutoTranslate } from '../../../components/TranslatedText.jsx';
import { recordProductEvent } from '../api/storiesApi.js';
import { useLiveProduct } from '../hooks/useLiveProduct.js';
import { ProductCTA } from './ProductCTA.jsx';
import { StickerLayer } from './StickerLayer.jsx';

export function ViewerContent({ story, userId, viewer, cart, videoRef, readOnly, actions, onOpenProfile, onOpenProduct }) {
  const { mediaLoading, setMediaLoading, setProgress, translatedCaption, setTranslatedCaption, next, setIsPaused } = viewer;
  const stop = (e) => e.stopPropagation();

  const product = useLiveProduct(story.product);
  const isMine = story.author_id === userId;
  // On ne mesure que les vues d'autres personnes, et jamais dans un highlight (pas de story_id valide).
  const trackingStoryId = !readOnly && userId && !isMine ? story.id : null;

  useEffect(() => {
    if (trackingStoryId && story.product?.id !== undefined) {
      recordProductEvent({ storyId: trackingStoryId, productId: story.product.id, type: 'view' });
    }
  }, [trackingStoryId, story.product?.id]);

  const hasMedia = story.media_url && story.media_type !== 'text';
  const hasBackground = !hasMedia && !!story.background;
  const hasStack = story.stickers?.length > 0 || story.poll?.question;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900" style={hasBackground ? { background: story.background } : undefined}>
      {mediaLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-20">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {hasMedia ? (
        story.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={story.media_url}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            onLoadedData={() => setMediaLoading(false)}
            onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100)}
            onEnded={next}
          />
        ) : (
          <img src={story.media_url} alt="story content" className="w-full h-full object-cover" onLoad={() => setMediaLoading(false)} />
        )
      ) : (
        <div className={`p-8 text-center w-full space-y-3 ${hasBackground ? 'text-white' : ''}`}>
          <AutoTranslate text={story.caption}>
            {(txt) => <RichTextRenderer content={translatedCaption || txt} className="text-xl font-medium" />}
          </AutoTranslate>
          {story.caption && (
            <div className="flex justify-center" onClick={stop}>
              <TranslateButton
                text={story.caption}
                isTranslated={!!translatedCaption}
                onTranslated={setTranslatedCaption}
                onClear={() => setTranslatedCaption(null)}
              />
            </div>
          )}
        </div>
      )}

      {product && (
        <div className="absolute top-20 inset-x-6 z-30 space-y-2" onClick={stop}>
          <ProductCard
            product={product}
            quantity={cart.quantities[product.id] || 0}
            onAdd={() => {
              cart.add(product.id);
              if (trackingStoryId) recordProductEvent({ storyId: trackingStoryId, productId: product.id, type: 'add_to_cart' });
            }}
            onRemove={() => cart.remove(product.id)}
          />
          <ProductCTA product={product} trackingStoryId={trackingStoryId} onOpenProduct={onOpenProduct} />
        </div>
      )}

      {hasStack && (
        <div className="absolute bottom-32 inset-x-6 z-30 space-y-2" onClick={stop}>
          <StickerLayer
            stickers={story.stickers}
            isMine={isMine}
            canInteract={!readOnly && !!actions}
            onAnswer={(sticker, text) => actions.answerQuestion(story, sticker, text)}
            onOpenProfile={onOpenProfile}
            onPause={setIsPaused}
          />
          {story.poll?.question && (
            <PollDisplay postId={story.id} question={story.poll.question} options={story.poll.options} endsAt={story.expires_at} user_id={userId} />
          )}
        </div>
      )}
    </div>
  );
}
