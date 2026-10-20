import { useMemo, useState } from 'react';
import { MAX_MEDIA_ITEMS, MAX_SCHEDULE_DAYS, MAX_STICKERS } from '../constants.js';
import { insertStory, uploadStoryMedia } from '../api/storiesApi.js';
import { useStoryDraft } from './useStoryDraft.js';

/** État et logique du formulaire de création. */
export function useStoryComposer({ userId, setError, onCreated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [background, setBackground] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [audio, setAudio] = useState(null);
  const [showPoll, setShowPoll] = useState(false);
  const [pollData, setPollData] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [product, setProduct] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [showStickers, setShowStickers] = useState(false);
  const [publishAt, setPublishAt] = useState('');   // '' = maintenant, sinon valeur datetime-local
  const [creating, setCreating] = useState(false);

  const hasPoll = !!(pollData?.question && pollData?.options?.some((o) => o.trim()));
  const isEmpty = !caption.trim() && mediaItems.length === 0 && !audio && !hasPoll && !product && stickers.length === 0;

  // --- Brouillon ---
  const snapshot = useMemo(
    () => ({ caption, background, stickers, pollData: hasPoll ? pollData : null, product, audio }),
    [caption, background, stickers, pollData, hasPoll, product, audio]
  );
  const draft = useStoryDraft(userId, snapshot, isOpen);

  const restoreDraft = () => {
    const d = draft.restore();
    if (!d) return;
    setCaption(d.caption || '');
    setBackground(d.background || null);
    setStickers(d.stickers || []);
    setPollData(d.pollData || null);
    setShowPoll(!!d.pollData);
    setProduct(d.product || null);
    setAudio(d.audio || null);
  };

  // --- Médias (galerie ou caméra : même traitement) ---
  const addFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const items = files.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      type: file.type.startsWith('video') ? 'video' : 'image',
      previewUrl: URL.createObjectURL(file),
      duration: 5,
    }));
    setMediaItems((prev) => [...prev, ...items].slice(0, MAX_MEDIA_ITEMS));
    e.target.value = '';
  };

  const moveMedia = (from, to) =>
    setMediaItems((prev) => {
      const u = [...prev];
      const [m] = u.splice(from, 1);
      u.splice(to, 0, m);
      return u;
    });

  const removeMedia = (mediaId) =>
    setMediaItems((prev) => {
      const gone = prev.find((m) => m.id === mediaId);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((m) => m.id !== mediaId);
    });

  const closePoll = () => { setShowPoll(false); setPollData(null); };

  // --- Stickers ---
  const addSticker = (s) => setStickers((prev) => [...prev, s].slice(0, MAX_STICKERS));
  const removeSticker = (id) => setStickers((prev) => prev.filter((s) => s.id !== id));

  const reset = () => {
    mediaItems.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setCaption(''); setBackground(null); setMediaItems([]); setAudio(null);
    setPollData(null); setProduct(null); setStickers([]); setPublishAt('');
    setShowPoll(false); setShowProductPicker(false); setShowStickers(false); setIsOpen(false);
  };

  const submit = async () => {
    setError('');
    if (isEmpty) return setError('Ajoute du texte, un média, un sondage, un produit, un sticker ou une musique');
    if (!userId) return setError('Tu dois être connecté');

    let publishIso = null;
    if (publishAt) {
      const d = new Date(publishAt);
      const diff = d.getTime() - Date.now();
      if (Number.isNaN(diff)) return setError('Date de programmation invalide');
      if (diff < 60_000) return setError('Choisis une heure dans le futur');
      if (diff > MAX_SCHEDULE_DAYS * 86_400_000) return setError(`Programmation limitée à ${MAX_SCHEDULE_DAYS} jours`);
      publishIso = d.toISOString();
    }

    setCreating(true);
    try {
      let mediaUrl = null;
      let mediaType = 'text';
      if (mediaItems.length > 0) {
        const first = mediaItems[0];
        mediaUrl = await uploadStoryMedia(first.file, userId);
        mediaType = first.type;
      }
      await insertStory({
        author_id: userId,
        media_type: mediaType,
        media_url: mediaUrl,
        caption: caption.trim(),
        background: mediaType === 'text' ? background : null,
        visibility: 'public',
        audio_url: audio?.audio_url || null,
        audio_title: audio?.title || null,
        poll: hasPoll ? pollData : null,
        product: product || null,
        stickers,
        ...(publishIso ? { publish_at: publishIso } : {}),
      });
      draft.clear();
      reset();
      await onCreated?.({ scheduledAt: publishIso });
    } catch (e) {
      setError('Erreur : ' + (e.message || 'Impossible de créer la story'));
    } finally {
      setCreating(false);
    }
  };

  return {
    isOpen, setIsOpen, caption, setCaption, background, setBackground,
    mediaItems, selectedMediaIndex, setSelectedMediaIndex, addFiles, moveMedia, removeMedia,
    audio, setAudio, showPoll, setShowPoll, pollData, setPollData, closePoll,
    showProductPicker, setShowProductPicker, product, setProduct,
    stickers, addSticker, removeSticker, showStickers, setShowStickers,
    publishAt, setPublishAt,
    hasDraft: draft.hasPending, restoreDraft, discardDraft: draft.discard,
    creating, isEmpty, submit,
  };
}
