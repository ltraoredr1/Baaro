import { useEffect, useRef, useState } from "react";

import CommentsSheet from "./components/CommentsSheet.jsx";
import {
  FeedEmpty,
  FeedError,
  FeedLoading,
} from "./components/FeedStatus.jsx";
import HandsFreeControls from "./components/HandsFreeControls.jsx";
import UploadModal from "./components/UploadModal.jsx";
import VideoCard, { isImageVideo } from "./components/VideoCard.jsx";

import { useCamera } from "./hooks/useCamera.js";
import { useFeedPlayback } from "./hooks/useFeedPlayback.js";
import { useSoundPicker } from "./hooks/useSoundPicker.js";
import { useSounds } from "./hooks/useSounds.js";
import { useVideoActions } from "./hooks/useVideoActions.js";
import { useVideoComments } from "./hooks/useVideoComments.js";
import { useVideoCreator } from "./hooks/useVideoCreator.js";
import { useVideoFeed } from "./hooks/useVideoFeed.js";

import VideoNextGenStudio from "./VideoNextGenStudio.jsx";

import { useToast } from "../../components/ToastContext.jsx";
import { EngagementList } from "../../components/EngagementList.jsx";

import { Volume2, VolumeX, Sparkles } from "lucide-react";

const IMAGE_DURATION_MS = 6000;

export function VideosTab({ onRewardPoints, onExit }) {
  const feed = useVideoFeed();

  const {
    setVideos,
    user,
    loading,
    loadError,
    loadVideos,
    likedMap,
    setLikedMap,
    visibleVideos,
  } = feed;

  const { sounds, getVideoSound } = useSounds();
  const playback = useFeedPlayback({ visibleVideos });
  const soundPicker = useSoundPicker(sounds);

  const creator = useVideoCreator({
    user,
    loadVideos,
    onRewardPoints,
    soundPicker,
  });

  const camera = useCamera({
    onOpen: () => creator.setShowUpload(true),
    onRecorded: creator.handleFileSelected,
  });

  const videoActions = useVideoActions({
    user,
    setVideos,
    likedMap,
    setLikedMap,
    loadVideos,
    videoRefs: playback.videoRefs,
    onRewardPoints,
  });

  const commentsState = useVideoComments({
    user,
    setVideos,
    onRewardPoints,
  });

  const { showToast } = useToast();

  const openUpload = () => creator.setShowUpload(true);

  // Garder la dernière version de la fonction pour l'événement global.
  const openUploadRef = useRef(openUpload);
  openUploadRef.current = openUpload;

  useEffect(() => {
    const handleGlobalVideoCreate = () => {
      openUploadRef.current();
    };

    window.addEventListener(
      "baaro:open-video-create",
      handleGlobalVideoCreate
    );

    return () => {
      window.removeEventListener(
        "baaro:open-video-create",
        handleGlobalVideoCreate
      );
    };
  }, []);

  const handleUseSound = (video, sound) => {
    const handle =
      video.profiles?.handle?.replace(/^@/, "") || "membre";

    const title = sound?.title || `Son original · @${handle}`;

    soundPicker.chooseSound({
      id: video.sound_id || null,
      title,
      artist: sound?.artist || `@${handle}`,
      audio_url: sound?.url || video.video_url,
    });

    openUpload();
    showToast(`Son « ${title} » sélectionné`, "success");
  };

  const actions = {
    ...videoActions,
    handleLike:
      videoActions.handleLike || videoActions.toggleLike,
    openComments: commentsState.openComments,
    onUseSound: handleUseSound,
  };

  const [studioOpen, setStudioOpen] = useState(false);
  const [viewersVideoId, setViewersVideoId] = useState(null);

  const handleStudioCreate = (selectedFeatures) => {
    setStudioOpen(false);

    if (selectedFeatures?.length > 0) {
      showToast(
        `${selectedFeatures.length} outils Studio activés`,
        "info"
      );
    }

    openUpload();
  };

  // --------------------------------------------------
  // FLUX VIDÉO ET DÉTECTION DE LA VIDÉO ACTIVE
  // --------------------------------------------------

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const slideRefs = useRef({});
  const ratiosRef = useRef({});
  const [activeId, setActiveId] = useState(null);

  // Toujours la dernière valeur, utilisable dans les écouteurs d'événements.
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  // Vidéo à relancer quand l'application / l'onglet redevient visible.
  const resumeIdRef = useRef(null);
  const feedVisibleRef = useRef(true);
  const lastAutoplayRef = useRef(null);

  // Clé stable : ne change que si la liste des publications change vraiment
  // (et non à chaque like ou commentaire), pour ne pas relancer les effets.
  const feedKey = visibleVideos.map((video) => String(video.id)).join("|");

  const getElement = (id) =>
    id == null ? null : playback.videoRefs?.current?.[id] || null;

  const pauseAll = () => {
    const refs = playback.videoRefs?.current || {};

    Object.entries(refs).forEach(([id, element]) => {
      if (!element) return;

      if (
        String(id) === String(activeIdRef.current) &&
        !element.paused
      ) {
        resumeIdRef.current = id;
      }

      element.pause();
    });
  };

  const resumeActive = () => {
    if (!feedVisibleRef.current || document.hidden) return;

    const id = resumeIdRef.current;
    if (id == null) return;

    resumeIdRef.current = null;
    getElement(id)?.play?.().catch(() => {});
  };

  const goToNext = (currentId) => {
    if (currentId == null) return false;

    const index = visibleVideos.findIndex(
      (video) => String(video.id) === String(currentId)
    );

    const nextVideo = visibleVideos[index + 1];

    if (!nextVideo) return false;

    slideRefs.current[String(nextVideo.id)]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    return true;
  };

  const goToPrevious = (currentId) => {
    if (currentId == null) return false;

    const index = visibleVideos.findIndex(
      (video) => String(video.id) === String(currentId)
    );

    const previousVideo = visibleVideos[index - 1];

    if (!previousVideo) return false;

    slideRefs.current[String(previousVideo.id)]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    return true;
  };

  // Pause / reprise de la vidéo active (directement sur l'élément).
  const toggleActivePlayback = () => {
    if (activeId == null) return;

    const element = getElement(activeId);

    if (element) {
      if (element.paused) element.play().catch(() => {});
      else element.pause();
      return;
    }

    playback.togglePlay?.(activeId);
  };

  const pauseActive = () => {
    getElement(activeId)?.pause();
  };

  const resumeActiveVideo = () => {
    getElement(activeId)?.play?.().catch(() => {});
  };

  const muteActive = () => {
    if (!playback.muted) playback.toggleMute();
  };

  const unmuteActive = () => {
    if (playback.muted) playback.toggleMute();
  };

  // Un seul like par commande mains libres.
  const likeActiveVideo = (videoId) => {
    const targetId = videoId ?? activeId;

    if (targetId == null) return;

    if (likedMap[targetId]) return;

    const likeHandler =
      videoActions.handleLike || videoActions.toggleLike;

    likeHandler?.(targetId);
  };

  const openActiveComments = (videoId) => {
    const targetId = videoId ?? activeId;

    if (targetId == null) return;

    commentsState.openComments(targetId);
  };

  const toggleActiveFullscreen = (videoId) => {
    const targetId = videoId ?? activeId;

    if (targetId == null) return;

    playback.toggleFullscreen(targetId);
  };

  // Identifier la publication visible à au moins 60 %
  // et couper immédiatement celles qui sortent de l'écran.
  useEffect(() => {
    const root = scrollRef.current;

    if (!root || visibleVideos.length === 0) {
      setActiveId(null);
      return;
    }

    ratiosRef.current = {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.dataset.videoId;

          ratiosRef.current[id] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;

          // Presque sortie de l'écran : on coupe tout de suite.
          if (entry.intersectionRatio < 0.3) {
            playback.videoRefs?.current?.[id]?.pause();
          }
        });

        let bestId = null;
        let bestRatio = 0;

        Object.entries(ratiosRef.current).forEach(([id, ratio]) => {
          if (ratio >= 0.6 && ratio > bestRatio) {
            bestId = id;
            bestRatio = ratio;
          }
        });

        if (bestId != null) setActiveId(bestId);
      },
      {
        root,
        threshold: [0, 0.3, 0.6, 1],
      }
    );

    Object.values(slideRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey, loading]);

  // Lire la vidéo active et mettre toutes les autres en pause.
  useEffect(() => {
    if (activeId == null) return;

    const refs = playback.videoRefs?.current || {};
    const changed = lastAutoplayRef.current !== String(activeId);
    lastAutoplayRef.current = String(activeId);

    Object.entries(refs).forEach(([id, element]) => {
      if (!element) return;

      if (String(id) === String(activeId)) {
        // Lecture automatique seulement au changement de vidéo :
        // une pause volontaire n'est pas annulée par un simple like.
        if (!changed) return;

        if (!feedVisibleRef.current || document.hidden) {
          resumeIdRef.current = id;
          return;
        }

        if (element.ended) {
          element.currentTime = 0;
        }

        element.play().catch(() => {});
      } else {
        element.pause();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey]);

  // Pause quand l'application passe en arrière-plan ou que le flux n'est plus affiché.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) pauseAll();
      else resumeActive();
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
      pauseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le composant peut rester monté sous un autre onglet : on coupe alors la lecture.
  useEffect(() => {
    const node = rootRef.current;

    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        feedVisibleRef.current = entry.isIntersecting;

        if (entry.isIntersecting) resumeActive();
        else pauseAll();
      },
      { threshold: 0.1 }
    );

    observer.observe(node);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Passer automatiquement à la vidéo suivante à la fin.
  useEffect(() => {
    if (activeId == null) return;

    const element = getElement(activeId);

    if (!element) return;

    element.loop = false;

    const handleEnded = () => {
      if (!goToNext(activeId)) {
        element.currentTime = 0;
        element.play().catch(() => {});
      }
    };

    element.addEventListener("ended", handleEnded);

    return () => {
      element.removeEventListener("ended", handleEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey]);

  // Afficher les images pendant six secondes avant de passer à la suite.
  useEffect(() => {
    if (activeId == null) return;

    const currentVideo = visibleVideos.find(
      (video) => String(video.id) === String(activeId)
    );

    if (!currentVideo || !isImageVideo(currentVideo)) {
      return;
    }

    const timer = setTimeout(() => {
      if (feedVisibleRef.current && !document.hidden) {
        goToNext(activeId);
      }
    }, IMAGE_DURATION_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey]);

  if (loading) {
    return <FeedLoading />;
  }

  // Économie de données : seule la vidéo active est chargée en entier,
  // la suivante en métadonnées, les autres ne sont pas téléchargées.
  const activeIndex = Math.max(
    0,
    visibleVideos.findIndex(
      (video) => String(video.id) === String(activeId)
    )
  );

  const getLoadMode = (index) => {
    if (index === activeIndex) return "active";
    if (index === activeIndex + 1) return "preload";
    return "none";
  };

  return (
    <div
      ref={rootRef}
      className="relative flex h-screen w-full flex-col overflow-hidden bg-black"
      style={{ height: "100dvh" }}
    >
      {/* Studio et contrôle du son */}
      <div className="absolute right-4 top-4 z-[70] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStudioOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 text-xs font-bold text-white shadow-lg backdrop-blur-xl transition-all hover:bg-black/60 active:scale-95"
          title="Studio NextGen"
        >
          <Sparkles size={14} className="text-yellow-400" />
          <span>Studio</span>
        </button>

        <button
          type="button"
          onClick={playback.toggleMute}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-xl transition-all hover:bg-black/60 active:scale-95"
          aria-label={
            playback.muted ? "Activer le son" : "Couper le son"
          }
          title={
            playback.muted ? "Activer le son" : "Couper le son"
          }
        >
          {playback.muted ? (
            <VolumeX size={17} />
          ) : (
            <Volume2 size={17} />
          )}
        </button>
      </div>

      {/* Flux vertical plein écran */}
      <div
        ref={scrollRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-black scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {loadError ? (
          <div className="flex h-full items-center justify-center">
            <FeedError
              message={loadError}
              onRetry={loadVideos}
            />
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <FeedEmpty onPublish={openUpload} />
          </div>
        ) : (
          visibleVideos.map((video, index) => (
            <div
              key={video.id}
              ref={(node) => {
                const id = String(video.id);

                if (node) {
                  slideRefs.current[id] = node;
                } else {
                  delete slideRefs.current[id];
                }
              }}
              data-video-id={String(video.id)}
              className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black"
            >
              <VideoCard
                video={video}
                sound={getVideoSound(video)}
                liked={!!likedMap[video.id]}
                user={user}
                playback={playback}
                actions={actions}
                isActive={String(video.id) === String(activeId)}
                loadMode={getLoadMode(index)}
                hideVolumeControl
                onShowViewers={() =>
                  setViewersVideoId(video.id)
                }
              />
            </div>
          ))
        )}
      </div>

      {/* Commandes vocales, gestes de la main et mouvements de tête */}
      <HandsFreeControls
        activeVideoId={activeId}
        isMuted={playback.muted}
        onNext={() => goToNext(activeId)}
        onPrevious={() => goToPrevious(activeId)}
        onLike={likeActiveVideo}
        onTogglePlayback={toggleActivePlayback}
        onPause={pauseActive}
        onResume={resumeActiveVideo}
        onToggleMute={playback.toggleMute}
        onMute={muteActive}
        onUnmute={unmuteActive}
        onOpenComments={openActiveComments}
        onToggleFullscreen={toggleActiveFullscreen}
      />

      {/* Commentaires */}
      {commentsState.showComments && (
        <CommentsSheet
          comments={
            commentsState.comments[
              commentsState.showComments
            ] || []
          }
          newComment={commentsState.newComment}
          setNewComment={commentsState.setNewComment}
          onSend={commentsState.sendComment}
          onClose={commentsState.closeComments}
        />
      )}

      {/* Publication */}
      <UploadModal
        creator={creator}
        soundPicker={soundPicker}
        camera={camera}
      />

      {/* Studio NextGen */}
      <VideoNextGenStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCreate={handleStudioCreate}
      />

      {/* Liste des spectateurs */}
      {viewersVideoId && (
        <EngagementList
          type="videoViews"
          targetId={viewersVideoId}
          ownerId={user?.id}
          viewerId={user?.id}
          onClose={() => setViewersVideoId(null)}
        />
      )}
    </div>
  );
}

export default VideosTab;
