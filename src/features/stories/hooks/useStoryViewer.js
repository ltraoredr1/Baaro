import { useCallback, useEffect, useRef, useState } from 'react';
import { STORY_DURATION } from '../constants.js';

/** Navigation + barre de progression de la visionneuse plein écran. */
export function useStoryViewer(stories, onOpen) {
  const [index, setIndex] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [translatedCaption, setTranslatedCaption] = useState(null);
  const timer = useRef(null);
  const mediaTimeout = useRef(null);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);

  const currentStory = index !== null ? stories[index] : null;
  const needsMediaLoad = (story) => Boolean(story?.media_url && story.media_type !== 'text');

  const reset = () => {
    clearTimeout(mediaTimeout.current);
    mediaTimeout.current = null;
    elapsedRef.current = 0;
    startedAtRef.current = 0;
    setProgress(0);
    setMediaLoading(false);
    setTranslatedCaption(null);
  };
  const resetForStory = () => {
    // Les refs du timer doivent être réinitialisées à chaque navigation.
    elapsedRef.current = 0;
    startedAtRef.current = 0;
    setProgress(0);
    setTranslatedCaption(null);
  };

  const next = useCallback(() => {
    if (index === null) return;
    if (index < stories.length - 1) {
      clearTimeout(mediaTimeout.current);
      mediaTimeout.current = null;
      resetForStory();
      setMediaLoading(needsMediaLoad(stories[index + 1])); setProgress(0); setTranslatedCaption(null);
      setIndex((i) => i + 1);
    } else {
      clearTimeout(mediaTimeout.current);
      mediaTimeout.current = null;
      setIndex(null); setTranslatedCaption(null);
    }
  }, [index, stories]);

  const previous = useCallback(() => {
    if (index !== null && index > 0) {
      clearTimeout(mediaTimeout.current);
      mediaTimeout.current = null;
      resetForStory();
      setMediaLoading(needsMediaLoad(stories[index - 1])); setProgress(0); setTranslatedCaption(null);
      setIndex((i) => i - 1);
    }
  }, [index, stories]);

  // Un média défaillant ou un réseau bloqué ne doit jamais laisser le viewer
  // derrière un spinner permanent. Les handlers du composant couvrent les
  // erreurs immédiates ; ce garde-fou couvre les timeouts de chargement.
  useEffect(() => {
    if (!currentStory?.media_url || !mediaLoading) return undefined;
    mediaTimeout.current = setTimeout(() => {
      mediaTimeout.current = null;
      setMediaLoading(false);
      if (currentStory.media_type === 'video') next();
    }, 10_000);
    return () => clearTimeout(mediaTimeout.current);
  }, [currentStory, mediaLoading, next]);

  // Défilement auto des images / textes (les vidéos pilotent via onTimeUpdate)
  useEffect(() => {
    if (!currentStory || isPaused || mediaLoading || currentStory.media_type === 'video') return;
    startedAtRef.current = Date.now();
    const tick = () => {
      const elapsed = elapsedRef.current + (Date.now() - startedAtRef.current);
      const pct = (elapsed / STORY_DURATION) * 100;
      if (pct >= 100) { elapsedRef.current = STORY_DURATION; setProgress(100); next(); }
      else { setProgress(pct); timer.current = setTimeout(tick, 50); }
    };
    timer.current = setTimeout(tick, 50);
    return () => {
      clearTimeout(timer.current);
      if (startedAtRef.current) elapsedRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = 0;
    };
  }, [currentStory, isPaused, mediaLoading, next]);

  useEffect(() => {
    if (index === null) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') previous();
      else if (event.key === ' ') {
        event.preventDefault();
        setIsPaused((paused) => !paused);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, next, previous]);

  const open = async (i) => {
    const s = stories[i];
    if (!s) return;
    reset(); setMediaLoading(needsMediaLoad(s)); setIndex(i); setIsPaused(false);
    await onOpen?.(s);
  };

  const close = () => { setIndex(null); reset(); };

  return {
    index, currentStory, isPaused, setIsPaused, progress, setProgress,
    mediaLoading, setMediaLoading, translatedCaption, setTranslatedCaption,
    open, close, next, previous,
  };
}
