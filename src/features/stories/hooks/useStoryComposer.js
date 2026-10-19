import { useState } from 'react';
import { MAX_MEDIA_ITEMS } from '../constants.js';
import { insertStory, uploadStoryMedia } from '../api/storiesApi.js';

/** État et logique du formulaire de création. */
export function useStoryComposer({ userId, setError, onCreated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [audio, setAudio] = useState(null);
  const [showPoll, setShowPoll] = useState(false);
  const [pollData, setPollData] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [product, setProduct] = useState(null);
  const [creating, setCreating] = useState(false);

  const hasPoll = !!(pollData?.question && pollData?.options?.some((o) => o.trim()));
  const isEmpty = !caption.trim() && mediaItems.length === 0 && !audio && !hasPoll && !product;

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

  const removeMedia = (mediaId) => setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));

  const closePoll = () => { setShowPoll(false); setPollData(null); };

  const reset = () => {
    setCaption(''); setMediaItems([]); setAudio(null); setPollData(null); setProduct(null);
    setShowPoll(false); setShowProductPicker(false); setIsOpen(false);
  };

  const submit = async () => {
    setError('');
    if (isEmpty) return setError('Ajoute du texte, un média, un sondage, un produit ou une musique');
    if (!userId) return setError('Tu dois être connecté');

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
        visibility: 'public',
        audio_url: audio?.audio_url || null,
        audio_title: audio?.title || null,
        poll: hasPoll ? pollData : null,
        product: product || null,
      });
      reset();
      await onCreated?.();
    } catch (e) {
      setError('Erreur : ' + (e.message || 'Impossible de créer la story'));
    } finally {
      setCreating(false);
    }
  };

  return {
    isOpen, setIsOpen, caption, setCaption,
    mediaItems, selectedMediaIndex, setSelectedMediaIndex, addFiles, moveMedia, removeMedia,
    audio, setAudio, showPoll, setShowPoll, pollData, setPollData, closePoll,
    showProductPicker, setShowProductPicker, product, setProduct,
    creating, isEmpty, submit,
  };
}
