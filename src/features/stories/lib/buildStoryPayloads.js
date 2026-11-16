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

  return media.map(({ asset, mediaType }) => ({
    author_id: userId,
    media_type: mediaType,
    media_url: asset?.url || null,
    caption: String(caption || '').trim() || null,
    background: mediaType === 'text' ? background : null,
    visibility: 'public',
    audio_url: audio?.audio_url || null,
    audio_title: audio?.title || null,
    poll: hasPoll ? pollData : null,
    product: product || null,
    stickers: stickers || [],
    publish_at: normalizedPublishAt,
    expires_at: normalizedExpiresAt,
  }));
}
