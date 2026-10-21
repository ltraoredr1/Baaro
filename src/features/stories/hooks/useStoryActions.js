
import { useState } from 'react';
import { answerSticker, sendReply } from '../api/storiesApi.js';

/** Réagir / répondre / partager / supprimer avec confirmation accessible. */
export function useStoryActions({
  userId,
  toggleReaction,
  removeStory,
  onRemoved,
}) {
  const [busy, setBusy] = useState(false);
  const [modalMsg, setModalMsg] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const fail = (prefix, e) =>
    setModalMsg({
      type: 'error',
      text: `${prefix} : ${e?.message || 'erreur'}`,
    });

  const needLogin = (what) => {
    setModalMsg({
      type: 'error',
      text: `Connecte-toi pour ${what}.`,
    });
  };

  const react = async (story, emoji) => {
    if (!userId) return needLogin('réagir');
    if (busy) return;

    setBusy(true);
    setModalMsg(null);

    try {
      await toggleReaction(story, emoji);
    } catch (e) {
      fail('Réaction impossible', e);
    } finally {
      setBusy(false);
    }
  };

  const reply = async (story, text) => {
    if (!userId) {
      needLogin('répondre');
      return false;
    }

    try {
      await sendReply(story.id, userId, text);
      setModalMsg({ type: 'ok', text: 'Message envoyé' });
      return true;
    } catch (e) {
      fail('Envoi impossible', e);
      return false;
    }
  };

  const answerQuestion = async (story, sticker, text) => {
    if (!userId) {
      needLogin('répondre');
      return false;
    }

    try {
      await answerSticker(story.id, sticker.id, userId, text);
      setModalMsg({ type: 'ok', text: 'Réponse envoyée' });
      return true;
    } catch (e) {
      fail('Envoi impossible', e);
      return false;
    }
  };

  const share = async (story) => {
    setModalMsg(null);

    const text = story.caption || 'Story BAARO';
    const url = story.media_url || window.location.origin;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'BAARO', text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setModalMsg({ type: 'ok', text: 'Lien copié' });
      } else {
        setModalMsg({
          type: 'error',
          text: 'Le partage n’est pas disponible sur cet appareil.',
        });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        setModalMsg({
          type: 'error',
          text: 'Partage impossible.',
        });
      }
    }
  };

  // Ouvre la confirmation sans supprimer la story.
  const remove = (story) => {
    if (!story || story.author_id !== userId || busy) return;
    setPendingRemoval(story);
    setModalMsg(null);
  };

  // Annule la demande de suppression.
  const cancelRemove = () => {
    if (busy) return;
    setPendingRemoval(null);
  };

  // Supprime uniquement après confirmation explicite.
  const confirmRemove = async () => {
    const story = pendingRemoval;

    if (!story || story.author_id !== userId || busy) return;

    setBusy(true);
    setModalMsg(null);
    setPendingRemoval(null);

    try {
      await removeStory(story);
      onRemoved?.();
    } catch (e) {
      fail('Suppression impossible', e);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    modalMsg,
    clearMsg: () => setModalMsg(null),
    react,
    reply,
    answerQuestion,
    share,
    remove,
    pendingRemoval,
    cancelRemove,
    confirmRemove,
  };
}
