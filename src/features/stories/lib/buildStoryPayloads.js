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
    publish_at: publishAt,
    expires_at: expiresAt,
  }));
}
