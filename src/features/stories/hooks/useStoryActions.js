import { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { answerSticker, sendReply } from '../api/storiesApi.js';
import { API_BASE } from '../../../config.js';

/** Réponses rapides proposées par défaut (le composant peut en fournir d'autres). */
export const QUICK_REPLIES = ['🔥', '👏', '😍', '😂', 'Bravo !', 'Trop bien !'];

/**
 * Réaction actuellement choisie par l'utilisateur sur une story.
 * À remplacer via l'option `getMyReaction` si ton état utilise un autre nom de champ.
 */
const defaultGetMyReaction = (story) => story?.my_reaction ?? story?.myReaction ?? null;

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

/** Copie un texte : API moderne d'abord, puis repli execCommand (WebView Android, contexte non sécurisé). */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // on tente le repli ci-dessous
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Réagir / répondre / partager / supprimer avec confirmation accessible. */
export function useStoryActions({
  userId,
  toggleReaction,
  removeStory,
  onRemoved,
  getMyReaction = defaultGetMyReaction,
}) {
  const [busy, setBusy] = useState(false);
  const [modalMsg, setModalMsg] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  // Retour visuel immédiat : storyId -> emoji (ou null si retirée), le temps de la requête.
  const [reactionOverrides, setReactionOverrides] = useState({});
  // Déclencheur d'animation (explosion d'emoji) : { id, storyId, emoji }.
  const [reactionBurst, setReactionBurst] = useState(null);

  const reactingRef = useRef(new Set()); // une requête de réaction à la fois par story
  const sendingRef = useRef(false); // envoi / suppression exclusifs (évite les doubles clics)

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

  /** Réaction affichée : valeur optimiste si une requête est en cours, sinon valeur serveur. */
  const getReaction = (story) => {
    const key = story?.id;
    if (key !== undefined && Object.prototype.hasOwnProperty.call(reactionOverrides, key)) {
      return reactionOverrides[key];
    }
    return getMyReaction(story);
  };

  const react = async (story, emoji) => {
    if (!story?.id) return;
    if (!userId) return needLogin('réagir');

    const key = story.id;
    if (reactingRef.current.has(key)) return;
    reactingRef.current.add(key);

    const current = getMyReaction(story);
    const next = current === emoji ? null : emoji;

    setModalMsg(null);
    setReactionOverrides((prev) => ({ ...prev, [key]: next }));
    if (next) setReactionBurst({ id: Date.now(), storyId: key, emoji: next });

    try {
      await toggleReaction(story, emoji);
    } catch (e) {
      fail('Réaction impossible', e); // l'override est retiré ci-dessous : retour à la valeur serveur
    } finally {
      reactingRef.current.delete(key);
      setReactionOverrides((prev) => {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
    }
  };

  const submitReply = async (story, text, okText) => {
    if (!userId) {
      needLogin('répondre');
      return false;
    }
    if (!story?.id) return false;

    const clean = String(text || '').trim();
    if (!clean) {
      setModalMsg({ type: 'error', text: 'Écris un message avant d’envoyer.' });
      return false;
    }

    if (sendingRef.current) return false;
    sendingRef.current = true;
    setBusy(true);
    setModalMsg(null);

    try {
      await sendReply(story.id, userId, clean);
      setModalMsg({ type: 'ok', text: okText });
      return true;
    } catch (e) {
      fail('Envoi impossible', e);
      return false;
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const reply = (story, text) => submitReply(story, text, 'Message envoyé');

  /** Réponse rapide en un tap (emoji ou phrase courte) : même circuit que `reply`. */
  const quickReply = (story, text) => submitReply(story, text, 'Réponse envoyée');

  const answerQuestion = async (story, sticker, text) => {
    if (!userId) {
      needLogin('répondre');
      return false;
    }
    if (!story?.id || !sticker?.id) return false;

    const clean = String(text || '').trim();
    if (!clean) {
      setModalMsg({ type: 'error', text: 'Écris une réponse avant d’envoyer.' });
      return false;
    }

    if (sendingRef.current) return false;
    sendingRef.current = true;
    setBusy(true);
    setModalMsg(null);

    try {
      await answerSticker(story.id, sticker.id, userId, clean);
      setModalMsg({ type: 'ok', text: 'Réponse envoyée' });
      return true;
    } catch (e) {
      fail('Envoi impossible', e);
      return false;
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  /**
   * Partage fiable : feuille de partage native -> copie du lien -> repli execCommand.
   * Un refus de la feuille native (hors geste utilisateur, WebView) bascule sur la copie.
   */
  const share = async (story) => {
    setModalMsg(null);

    // Deep-link app (story id) plutôt que l'URL brute du média CDN.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareOrigin = Capacitor.isNativePlatform()
      ? import.meta.env.VITE_PUBLIC_APP_URL || API_BASE || 'https://baaro-xi.vercel.app'
      : origin;
    const url = story?.id && shareOrigin
      ? new URL(`/?story=${encodeURIComponent(story.id)}`, shareOrigin).toString()
      : isHttpUrl(story?.media_url)
        ? story.media_url
        : '';
    if (!url) {
      setModalMsg({ type: 'error', text: 'Cette story ne peut pas être partagée.' });
      return false;
    }
    const data = {
      title: 'BAARO',
      text: String(story?.caption || '').trim() || 'Story BAARO',
      url,
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        return true;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return false; // l'utilisateur a fermé la feuille
      // autre erreur : on tente la copie du lien
    }

    const copied = await copyToClipboard(url);
    setModalMsg(
      copied
        ? { type: 'ok', text: 'Lien copié' }
        : { type: 'error', text: 'Partage impossible sur cet appareil.' },
    );
    return copied;
  };

  // Ouvre la confirmation sans supprimer la story.
  const remove = (story) => {
    if (!story || story.author_id !== userId || sendingRef.current) return;
    setPendingRemoval(story);
    setModalMsg(null);
  };

  // Annule la demande de suppression.
  const cancelRemove = () => {
    if (sendingRef.current) return;
    setPendingRemoval(null);
  };

  // Supprime uniquement après confirmation explicite.
  const confirmRemove = async () => {
    const story = pendingRemoval;

    if (!story || story.author_id !== userId || sendingRef.current) return;

    sendingRef.current = true;
    setBusy(true);
    setModalMsg(null);
    setPendingRemoval(null);

    try {
      await removeStory(story);
      onRemoved?.();
    } catch (e) {
      fail('Suppression impossible', e);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  return {
    busy,
    modalMsg,
    clearMsg: () => setModalMsg(null),
    react,
    getReaction,
    reactionOverrides,
    reactionBurst,
    reply,
    quickReply,
    answerQuestion,
    share,
    remove,
    pendingRemoval,
    cancelRemove,
    confirmRemove,
  };
}
