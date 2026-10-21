
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

  const scrollRef = useRef(null);
  const slideRefs = useRef({});
  const [activeId, setActiveId] = useState(null);

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

  // Pause / reprise de la vidéo active.
  const toggleActivePlayback = () => {
    if (activeId == null) return;
    playback.togglePlay(activeId);
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

  // Identifier la publication visible à au moins 60 %.
  useEffect(() => {
    const root = scrollRef.current;

    if (!root || visibleVideos.length === 0) {
      setActiveId(null);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              entry.intersectionRatio >= 0.6
          )
          .sort(
            (a, b) =>
              b.intersectionRatio - a.intersectionRatio
          )[0];

        if (visibleEntry) {
          setActiveId(visibleEntry.target.dataset.videoId);
        }
      },
      {
        root,
        threshold: [0.6],
      }
    );

    Object.values(slideRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [visibleVideos]);

  // Lire la vidéo active et mettre les autres en pause.
  useEffect(() => {
    if (activeId == null) return;

    const refs = playback.videoRefs?.current || {};

    Object.entries(refs).forEach(([id, element]) => {
      if (!element) return;

      if (String(id) === String(activeId)) {
        if (element.ended) {
          element.currentTime = 0;
        }

        element.play().catch(() => {});
      } else {
        element.pause();
      }
    });
    // Le hook de lecture gère également la visibilité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, visibleVideos]);

  // Passer automatiquement à la vidéo suivante à la fin.
  useEffect(() => {
    if (activeId == null) return;

    const element =
      playback.videoRefs?.current?.[activeId];

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
  }, [activeId, visibleVideos]);

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
      goToNext(activeId);
    }, IMAGE_DURATION_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, visibleVideos]);

  if (loading) {
    return <FeedLoading />;
  }

  return (
    <div
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
          visibleVideos.map((video) => (
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
        onNext={() => goToNext(activeId)}
        onPrevious={() => goToPrevious(activeId)}
        onLike={likeActiveVideo}
        onTogglePlayback={toggleActivePlayback}
        onToggleMute={playback.toggleMute}
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
