import { useState } from 'react';
import { answerSticker, sendReply } from '../api/storiesApi.js';

/** Réagir / répondre / partager / supprimer, avec état busy et message du viewer. */
export function useStoryActions({ userId, toggleReaction, removeStory, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [modalMsg, setModalMsg] = useState(null);

  const fail = (prefix, e) => setModalMsg({ type: 'error', text: `${prefix} : ${e?.message || 'erreur'}` });
  const needLogin = (what) => { setModalMsg({ type: 'error', text: `Connecte-toi pour ${what}.` }); };

  const react = async (story, emoji) => {
    if (!userId) return needLogin('réagir');
    if (busy) return;
    setBusy(true); setModalMsg(null);
    try { await toggleReaction(story, emoji); }
    catch (e) { fail('Réaction impossible', e); }
    finally { setBusy(false); }
  };

  const reply = async (story, text) => {
    if (!userId) { needLogin('répondre'); return false; }
    try {
      await sendReply(story.id, userId, text);
      setModalMsg({ type: 'ok', text: 'Message envoyé' });
      return true;
    } catch (e) { fail('Envoi impossible', e); return false; }
  };

  const answerQuestion = async (story, sticker, text) => {
    if (!userId) { needLogin('répondre'); return false; }
    try {
      await answerSticker(story.id, sticker.id, userId, text);
      setModalMsg({ type: 'ok', text: 'Réponse envoyée' });
      return true;
    } catch (e) { fail('Envoi impossible', e); return false; }
  };

  const share = async (story) => {
    setModalMsg(null);
    const text = story.caption || 'Story BAARO';
    const url = story.media_url || window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: 'BAARO', text, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setModalMsg({ type: 'ok', text: 'Lien copié' });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setModalMsg({ type: 'error', text: 'Partage impossible.' });
    }
  };

  const remove = async (story) => {
    if (story.author_id !== userId || busy) return;
    if (!window.confirm('Supprimer cette story ?')) return;
    setBusy(true); setModalMsg(null);
    try { await removeStory(story); onRemoved?.(); }
    catch (e) { fail('Suppression impossible', e); }
    finally { setBusy(false); }
  };

  return { busy, modalMsg, clearMsg: () => setModalMsg(null), react, reply, answerQuestion, share, remove };
}
