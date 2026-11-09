import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_MEDIA_ITEMS, MAX_SCHEDULE_DAYS, MAX_UPLOAD_BYTES, STORY_LIFETIME_MS } from '../constants.js';
import { discardUploadedMedia } from '../../../lib/externalMedia.js';
import { insertStories, uploadStoryMedia } from '../api/storiesApi.js';
import { validateStoryFiles } from '../lib/nativeValidation.js';
import { buildStoryPayloads } from '../lib/buildStoryPayloads.js';
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
  const [publishAt, setPublishAt] = useState('');
  const [creating, setCreating] = useState(false);
  const previewUrls = useRef(new Set());

  const hasPoll = !!(pollData?.question && pollData?.options?.some((o) => o.trim()));
  const isEmpty = !caption.trim() && mediaItems.length === 0 && !audio && !hasPoll && !product && stickers.length === 0;

  const snapshot = useMemo(
    () => ({ caption, background, stickers, pollData: hasPoll ? pollData : null, product, audio }),
    [caption, background, stickers, pollData, hasPoll, product, audio]
  );
  const draft = useStoryDraft(userId, snapshot, isOpen);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

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

  const addFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = Math.max(0, MAX_MEDIA_ITEMS - mediaItems.length);
    if (files.length > room) setError(`Maximum ${MAX_MEDIA_ITEMS} médias par publication`);
    const added = files.slice(0, room).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        previewUrl,
        duration: 5,
      };
    });
    if (added.length) setMediaItems((prev) => [...prev, ...added].slice(0, MAX_MEDIA_ITEMS));
  };

  const moveMedia = (from, to) =>
    setMediaItems((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });

  const removeMedia = (mediaId) => {
    const gone = mediaItems.find((m) => m.id === mediaId);
    if (gone) {
      URL.revokeObjectURL(gone.previewUrl);
      previewUrls.current.delete(gone.previewUrl);
    }
    const next = mediaItems.filter((m) => m.id !== mediaId);
    setMediaItems(next);
    setSelectedMediaIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
  };

  const closePoll = () => { setShowPoll(false); setPollData(null); };
  const addSticker = (s) => setStickers((prev) => [...prev, s]);
  const removeSticker = (id) => setStickers((prev) => prev.filter((s) => s.id !== id));

  const reset = () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    setCaption(''); setBackground(null); setMediaItems([]); setSelectedMediaIndex(0); setAudio(null);
    setPollData(null); setProduct(null); setStickers([]); setPublishAt('');
    setShowPoll(false); setShowProductPicker(false); setShowStickers(false); setIsOpen(false);
  };

  const submit = async () => {
    if (creating) return;
    setError('');
    if (isEmpty) return setError('Ajoute du texte, un média, un sondage, un produit, un sticker ou une musique');
    if (!userId) return setError('Tu dois être connecté');

    const publishDate = publishAt ? new Date(publishAt) : new Date();
    const publishTime = publishDate.getTime();
    const delay = publishTime - Date.now();
    if (!Number.isFinite(publishTime)) return setError('Date de programmation invalide');
    if (publishAt && delay < 60_000) return setError('Choisis une heure dans le futur (au moins 1 minute)');
    if (publishAt && delay > MAX_SCHEDULE_DAYS * 86_400_000) {
      return setError(`Programmation limitée à ${MAX_SCHEDULE_DAYS} jours`);
    }
    if (mediaItems.some((m) => m.file.size > MAX_UPLOAD_BYTES)) {
      return setError(`Chaque média doit faire au maximum ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo`);
    }

    setCreating(true);
    const uploaded = [];
    let insertStarted = false;
    try {
      const mediaKinds = await validateStoryFiles(mediaItems.map((m) => m.file), publishAt);
      const publishIso = publishDate.toISOString();
      const expiresIso = new Date(publishTime + STORY_LIFETIME_MS).toISOString();
      const uploadedAssets = [];

      // Le schéma actuel stocke un seul media_url par ligne : un lot multi-fichier
      // devient donc une story par média, comme dans la cross-publication du Feed.
      for (let i = 0; i < mediaItems.length; i += 1) {
        const asset = await uploadStoryMedia(mediaItems[i].file, userId, mediaKinds[i].mime);
        uploaded.push(asset);
        uploadedAssets.push(asset);
      }

      const rows = buildStoryPayloads({
        userId, caption, background, audio, hasPoll, pollData, product, stickers,
        mediaAssets: uploadedAssets, mediaKinds, publishAt: publishIso, expiresAt: expiresIso,
      });

      insertStarted = true;
      await insertStories(rows);
      draft.clear();
      reset();
      await onCreated?.({ scheduledAt: publishAt ? publishIso : null, storyCount: rows.length });
    } catch (e) {
      // Nettoyage sûr si aucune insertion n'a été tentée, ou si PostgreSQL a
      // explicitement confirmé l'échec transactionnel du batch. Un timeout réseau
      // après INSERT est ambigu : ne pas risquer de supprimer un média déjà référencé.
      if (!insertStarted || e?.safeToDiscard) {
        await Promise.allSettled(uploaded.map((asset) => discardUploadedMedia(asset?.path || asset?.object_key)));
      }
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
