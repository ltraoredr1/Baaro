export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function computeStoryExpiry(publishAt) {
  const publishTime = new Date(publishAt).getTime();
  if (!Number.isFinite(publishTime)) throw new Error('Date de publication invalide.');
  return new Date(publishTime + STORY_LIFETIME_MS).toISOString();
}

export function buildStoryPayloads({
  userId,
  caption,
  background,
  audio,
  hasPoll,
  pollData,
  product,
  stickers,
  mediaAssets = [],
  mediaKinds = [],
  publishAt,
  expiresAt,
}) {
  const normalizedPublishAt = new Date(publishAt).toISOString();
  const normalizedExpiresAt = computeStoryExpiry(normalizedPublishAt);
  const media = mediaAssets.length
    ? mediaAssets.map((asset, index) => ({ asset, mediaType: mediaKinds[index]?.mediaType || 'image' }))
    : [{ asset: null, mediaType: 'text' }];

  // Un lot multi-médias crée une ligne par média. Poll, produit, stickers et
  // audio ne sont attachés qu'à la première story pour éviter N sondages /
  // N CTAs identiques et des analytics dispersées. La légende reste sur chaque slide.
  return media.map(({ asset, mediaType }, index) => {
    const isPrimary = index === 0;
    return {
      author_id: userId,
      media_type: mediaType,
      media_url: asset?.url || null,
      caption: String(caption || '').trim() || null,
      background: mediaType === 'text' ? background : null,
      visibility: 'public',
      audio_url: isPrimary ? audio?.audio_url || null : null,
      audio_title: isPrimary ? audio?.title || null : null,
      poll: isPrimary && hasPoll ? pollData : null,
      product: isPrimary ? product || null : null,
      stickers: isPrimary ? stickers || [] : [],
      publish_at: normalizedPublishAt,
      expires_at: normalizedExpiresAt,
    };
  });
}
