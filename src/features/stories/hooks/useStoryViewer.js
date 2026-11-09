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

  const currentStory = index !== null ? stories[index] : null;
  const needsMediaLoad = (story) => Boolean(story?.media_url && story.media_type !== 'text');

  const reset = () => { setProgress(0); setTranslatedCaption(null); };

  const next = useCallback(() => {
    if (index === null) return;
    if (index < stories.length - 1) {
      setMediaLoading(needsMediaLoad(stories[index + 1])); setProgress(0); setTranslatedCaption(null);
      setIndex((i) => i + 1);
    } else {
      setIndex(null); setTranslatedCaption(null);
    }
  }, [index, stories]);

  const previous = useCallback(() => {
    if (index !== null && index > 0) {
      setMediaLoading(needsMediaLoad(stories[index - 1])); setProgress(0); setTranslatedCaption(null);
      setIndex((i) => i - 1);
    }
  }, [index, stories]);

  // Défilement auto des images / textes (les vidéos pilotent via onTimeUpdate)
  useEffect(() => {
    if (!currentStory || isPaused || mediaLoading || currentStory.media_type === 'video') return;
    const start = Date.now();
    const tick = () => {
      const pct = ((Date.now() - start) / STORY_DURATION) * 100;
      if (pct >= 100) { setProgress(100); next(); }
      else { setProgress(pct); timer.current = setTimeout(tick, 50); }
    };
    timer.current = setTimeout(tick, 50);
    return () => clearTimeout(timer.current);
  }, [currentStory, isPaused, mediaLoading, next]);

  const open = async (i) => {
    const s = stories[i];
    if (!s) return;
    reset(); setMediaLoading(needsMediaLoad(s)); setIndex(i);
    await onOpen?.(s);
  };

  const close = () => { setIndex(null); reset(); };

  return {
    index, currentStory, isPaused, setIsPaused, progress, setProgress,
    mediaLoading, setMediaLoading, translatedCaption, setTranslatedCaption,
    open, close, next, previous,
  };
}
