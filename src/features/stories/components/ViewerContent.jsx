import { useCallback, useEffect, useState } from 'react';
import { PollDisplay } from '../../../components/PollDisplay.jsx';
import ProductCard from '../../../components/ProductCard.jsx';
import { RichTextRenderer } from '../../../components/RichTextRenderer.jsx';
import { TranslateButton } from '../../../components/TranslateButton.jsx';
import { AutoTranslate } from '../../../components/TranslatedText.jsx';
import { recordProductEvent } from '../api/storiesApi.js';
import { useLiveProduct } from '../hooks/useLiveProduct.js';
import { ProductCTA } from './ProductCTA.jsx';
import { StickerLayer } from './StickerLayer.jsx';
import { supabase, followUser, unfollowUser, sendFriendRequest, acceptFriendRequest } from '../../../supabaseClient.js';

const pill = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border disabled:opacity-60';
const pillOff = `${pill} bg-white/15 text-white border-white/25 hover:bg-white/25`;
const pillOn = `${pill} bg-amber-400/90 text-black border-amber-300`;

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

  // Abonnement / ami : seulement sur la story d'un autre, hors highlights
  const authorId = story.author_id;
  const showRelation = !readOnly && !!userId && !!authorId && !isMine;
  const [rel, setRel] = useState(null); // { following, friend: 'none'|'pending_out'|'pending_in'|'friends' }
  const [relBusy, setRelBusy] = useState(false);

  const loadRelation = useCallback(async () => {
    if (!showRelation) return null;
    const { data } = await supabase
      .from('follows')
      .select('follower_id,followed_id,status,is_friend')
      .or(`and(follower_id.eq.${userId},followed_id.eq.${authorId}),and(follower_id.eq.${authorId},followed_id.eq.${userId})`);
    const mine = data?.find((r) => r.follower_id === userId);
    const theirs = data?.find((r) => r.follower_id === authorId);
    let friend = 'none';
    if ((mine?.is_friend && mine.status === 'accepted') || (theirs?.is_friend && theirs.status === 'accepted')) friend = 'friends';
    else if (mine?.is_friend && mine.status === 'pending') friend = 'pending_out';
    else if (theirs?.is_friend && theirs.status === 'pending') friend = 'pending_in';
    return { following: mine?.status === 'accepted', friend };
  }, [showRelation, userId, authorId]);

  useEffect(() => {
    let alive = true;
    setRel(null);
    loadRelation().then((r) => alive && setRel(r)).catch(() => {});
    return () => { alive = false; };
  }, [loadRelation]);

  const runRelation = async (action) => {
    if (relBusy) return;
    setRelBusy(true);
    try {
      await action();
      setRel(await loadRelation());
    } catch {
      /* l'état affiché reste celui de la base */
    } finally {
      setRelBusy(false);
    }
  };
  const showRelButtons = showRelation && !!rel;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      style={hasBackground ? { background: story.background } : undefined}
    >
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
            className="w-full h-full object-contain"
            autoPlay
            playsInline
            onLoadedData={() => setMediaLoading(false)}
            onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100)}
            onEnded={next}
          />
        ) : (
          <>
            {/* Fond flouté : remplit les bandes sans rogner l'image principale */}
            <img
              src={story.media_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-40 pointer-events-none"
            />
            <img
              src={story.media_url}
              alt="story content"
              className="relative max-w-full max-h-full w-auto h-auto object-contain"
              onLoad={() => setMediaLoading(false)}
              onError={() => setMediaLoading(false)}
            />
          </>
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

      {showRelButtons && (
        <div className="absolute top-[76px] left-4 z-30 flex items-center gap-2" onClick={stop}>
          {rel.friend === 'friends' && <span className={pillOn}>✓ Amis</span>}

          {rel.friend !== 'friends' && rel.friend !== 'pending_out' && (
            <button
              type="button"
              disabled={relBusy}
              className={rel.following ? pillOn : pillOff}
              onClick={() => runRelation(() => (rel.following ? unfollowUser(authorId) : followUser(authorId)))}
            >
              {rel.following ? '✓ Abonné' : "+ S'abonner"}
            </button>
          )}

          {rel.friend === 'none' && (
            <button type="button" disabled={relBusy} className={pillOff} onClick={() => runRelation(() => sendFriendRequest(authorId))}>
              Ajouter en ami
            </button>
          )}
          {rel.friend === 'pending_in' && (
            <button type="button" disabled={relBusy} className={pillOn} onClick={() => runRelation(() => acceptFriendRequest(authorId))}>
              Accepter
            </button>
          )}
          {rel.friend === 'pending_out' && <span className={pillOff}>Demande envoyée</span>}
        </div>
      )}

      {product && (
        <div className={`absolute ${showRelButtons ? 'top-32' : 'top-20'} inset-x-6 z-30 space-y-2`} onClick={stop}>
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
