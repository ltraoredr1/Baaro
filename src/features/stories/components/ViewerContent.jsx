import { PollDisplay } from '../../../components/PollDisplay.jsx';
import ProductCard from '../../../components/ProductCard.jsx';
import { RichTextRenderer } from '../../../components/RichTextRenderer.jsx';
import { TranslateButton } from '../../../components/TranslateButton.jsx';
import { AutoTranslate } from '../../../components/TranslatedText.jsx';

export function ViewerContent({ story, userId, viewer, cart, videoRef }) {
  const { mediaLoading, setMediaLoading, setProgress, translatedCaption, setTranslatedCaption, next } = viewer;
  const stop = (e) => e.stopPropagation();

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
      {mediaLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-20">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {story.media_url && story.media_type !== 'text' ? (
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
        <div className="p-8 text-center w-full space-y-3">
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

      {story.product && (
        <div className="absolute top-20 inset-x-6 z-30" onClick={stop}>
          <ProductCard
            product={story.product}
            quantity={cart.quantities[story.product.id] || 0}
            onAdd={() => cart.add(story.product.id)}
            onRemove={() => cart.remove(story.product.id)}
          />
        </div>
      )}

      {story.poll?.question && (
        <div className="absolute bottom-20 inset-x-6 z-30" onClick={stop}>
          <PollDisplay postId={story.id} question={story.poll.question} options={story.poll.options} endsAt={story.expires_at} user_id={userId} />
        </div>
      )}
    </div>
  );
}
