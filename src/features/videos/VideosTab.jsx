import { useEffect, useRef, useState } from "react";

import CommentsSheet from "./components/CommentsSheet.jsx";
import {
  FeedEmpty,
  FeedError,
  FeedLoading,
} from "./components/FeedStatus.jsx";
import CreateVideoFab from "./components/CreateVideoFab.jsx";
import FeedHeader from "./components/FeedHeader.jsx";
import HandsFreeControls from "./components/HandsFreeControls.jsx";
import UploadModal from "./components/UploadModal.jsx";
import VideoCard, { isImageVideo } from "./components/VideoCard.jsx";

import { useCamera } from "./hooks/useCamera.js";
import { useFeedPlayback } from "./hooks/useFeedPlayback.js";
import { usePlaybackSettings, SPEEDS } from "./hooks/usePlaybackSettings.js";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion.js";
import { useVideoCompression } from "./hooks/useVideoCompression.js";
import { useSoundPicker } from "./hooks/useSoundPicker.js";
import { useSounds } from "./hooks/useSounds.js";
import { useVideoActions } from "./hooks/useVideoActions.js";
import { useVideoComments } from "./hooks/useVideoComments.js";
import { useVideoCreator } from "./hooks/useVideoCreator.js";
import { useVideoFeed } from "./hooks/useVideoFeed.js";

import VideoNextGenStudio from "./VideoNextGenStudio.jsx";

import { useToast } from "../../components/ToastContext.jsx";
import { EngagementList } from "../../components/EngagementList.jsx";

import { Gauge, Leaf } from "lucide-react";

const IMAGE_DURATION_MS = 6000;

// Nombre de publications montées de chaque côté de la vidéo active.
// Les autres restent des emplacements vides : moins de DOM, moins de mémoire,
// aucun téléchargement.
const RENDER_WINDOW = 2;

const SAVER_NEXT = { auto: "on", on: "off", off: "auto" };
const SAVER_LABEL = { auto: "Auto", on: "Activé", off: "Désactivé" };

const isTypingTarget = (target) => {
  if (!target) return false;

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

export function VideosTab({ onRewardPoints, onExit }) {
  const reducedMotion = usePrefersReducedMotion();
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

  const { settings, update: updateSettings, dataSaverActive } =
    usePlaybackSettings();

  const { showToast } = useToast();

  const creator = useVideoCreator({
    user,
    loadVideos,
    onRewardPoints,
    soundPicker,
  });

  // Compression avant envoi : tout fichier (galerie ou caméra) passe par ici.
  const compression = useVideoCompression();

  const creatorRef = useRef(creator);
  creatorRef.current = creator;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const handleFileSelected = async (file) => {
    if (!file) return;

    if (!settingsRef.current.compressUploads) {
      creatorRef.current.handleFileSelected(file);
      return;
    }

    const result = await compression.compress(file);

    // Fenêtre fermée pendant l'optimisation : on ne sélectionne rien.
    if (result.status === "aborted" || !result.file) return;

    if (result.status === "done") {
      const toMb = (bytes) => `${(bytes / 1048576).toFixed(1)} Mo`;

      showToast(
        `Vidéo allégée : ${toMb(file.size)} → ${toMb(result.file.size)}`,
        "success"
      );
    } else if (result.status === "interrupted") {
      showToast(
        "Optimisation interrompue (application en arrière-plan) : vidéo d'origine conservée",
        "info"
      );
    }

    creatorRef.current.handleFileSelected(result.file);
  };

  const creatorForModal = { ...creator, handleFileSelected };

  const camera = useCamera({
    onOpen: () => creator.setShowUpload(true),
    onRecorded: handleFileSelected,
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
  const [studioFeatures, setStudioFeatures] = useState([]);
  const [viewersVideoId, setViewersVideoId] = useState(null);

  const handleStudioCreate = (selectedFeatures) => {
    setStudioOpen(false);
    setStudioFeatures(selectedFeatures || []);

    if (selectedFeatures?.length > 0) {
      showToast(
        `${selectedFeatures.length} outil${
          selectedFeatures.length > 1 ? "s" : ""
        } Studio sélectionné${selectedFeatures.length > 1 ? "s" : ""}`,
        "info"
      );
    }

    openUpload();
  };

  const overlayOpen =
    !!creator.showUpload ||
    studioOpen ||
    !!commentsState.showComments ||
    !!viewersVideoId;

  // --------------------------------------------------
  // FLUX VIDÉO ET DÉTECTION DE LA VIDÉO ACTIVE
  // --------------------------------------------------

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const progressRef = useRef(null);
  const slideRefs = useRef({});
  const ratiosRef = useRef({});
  const [activeId, setActiveId] = useState(null);

  // Toujours la dernière valeur, utilisable dans les écouteurs d'événements.
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  const mutedRef = useRef(playback.muted);
  mutedRef.current = playback.muted;

  const toggleMuteRef = useRef(playback.toggleMute);
  toggleMuteRef.current = playback.toggleMute;

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Vidéo à relancer quand l'application / l'onglet redevient visible.
  const resumeIdRef = useRef(null);
  const feedVisibleRef = useRef(true);
  const lastAutoplayRef = useRef(null);
  const soundHintShownRef = useRef(false);

  // Clé stable : ne change que si la liste des publications change vraiment
  // (et non à chaque like ou commentaire), pour ne pas relancer les effets.
  const feedKey = visibleVideos.map((video) => String(video.id)).join("|");

  const activeVideo =
    activeId == null
      ? null
      : visibleVideos.find(
          (video) => String(video.id) === String(activeId)
        ) || null;

  const getElement = (id) =>
    id == null ? null : playback.videoRefs?.current?.[id] || null;

  // Lecture sûre : si le navigateur refuse la lecture avec le son
  // (politique d'autoplay), on relance en muet au lieu de rester figé.
  const safePlay = (element) => {
    if (!element) return;

    const promise = element.play?.();

    promise?.catch?.((error) => {
      if (error?.name !== "NotAllowedError" || element.muted) return;

      element.muted = true;
      element.play().catch(() => {});

      if (!mutedRef.current) toggleMuteRef.current?.();

      if (!soundHintShownRef.current) {
        soundHintShownRef.current = true;
        showToastRef.current?.(
          "Son coupé par le navigateur — touchez 🔊 pour l'activer",
          "info"
        );
      }
    });
  };

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
    safePlay(getElement(id));
  };

  const goToOffset = (currentId, delta) => {
    if (currentId == null) return false;

    const index = visibleVideos.findIndex(
      (video) => String(video.id) === String(currentId)
    );

    if (index === -1) return false;

    const target = visibleVideos[index + delta];

    if (!target) return false;

    slideRefs.current[String(target.id)]?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });

    return true;
  };

  const goToNext = (currentId) => goToOffset(currentId, 1);
  const goToPrevious = (currentId) => goToOffset(currentId, -1);

  // Pause / reprise de la vidéo active (directement sur l'élément).
  const toggleActivePlayback = () => {
    if (activeId == null) return;

    const element = getElement(activeId);

    if (element) {
      if (element.paused) safePlay(element);
      else element.pause();
      return;
    }

    playback.togglePlay?.(activeId);
  };

  const pauseActive = () => {
    getElement(activeId)?.pause();
  };

  const resumeActiveVideo = () => {
    safePlay(getElement(activeId));
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

  // Réglages rapides (barre du haut)
  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(settings.speed);
    const next = SPEEDS[(index + 1) % SPEEDS.length];

    updateSettings({ speed: next });
    showToast(`Vitesse ×${next}`, "info");
  };

  const cycleDataSaver = () => {
    const next = SAVER_NEXT[settings.dataSaver] || "auto";

    updateSettings({ dataSaver: next });
    showToast(`Économie de données : ${SAVER_LABEL[next]}`, "info");
  };

  // Raccourcis clavier (ordinateur) : toujours la dernière version du gestionnaire.
  const keyHandlerRef = useRef(() => {});

  keyHandlerRef.current = (event) => {
    if (
      overlayOpen ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTypingTarget(event.target)
    ) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
      case "j":
        event.preventDefault();
        goToNext(activeIdRef.current);
        break;
      case "ArrowUp":
      case "k":
        event.preventDefault();
        goToPrevious(activeIdRef.current);
        break;
      case " ":
        event.preventDefault();
        toggleActivePlayback();
        break;
      case "m":
        toggleMuteRef.current?.();
        break;
      case "l":
        likeActiveVideo();
        break;
      case "c":
        openActiveComments();
        break;
      case "f":
        toggleActiveFullscreen();
        break;
      default:
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => keyHandlerRef.current(event);

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Identifier la publication visible à au moins 60 %
  // et couper immédiatement celles qui sortent de l'écran.
  useEffect(() => {
    const root = scrollRef.current;

    if (!root || visibleVideos.length === 0) {
      setActiveId(null);
      return undefined;
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
    let foundActive = false;

    Object.entries(refs).forEach(([id, element]) => {
      if (!element) return;

      if (String(id) === String(activeId)) {
        foundActive = true;
        element.playbackRate = settings.speed;

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

        safePlay(element);
      } else {
        element.pause();
      }
    });

    // On ne mémorise la vidéo qu'une fois son élément réellement trouvé :
    // sinon une carte montée en retard ne démarrerait jamais.
    if (foundActive) lastAutoplayRef.current = String(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey]);

  // Vitesse de lecture.
  useEffect(() => {
    const element = getElement(activeId);

    if (element) element.playbackRate = settings.speed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey, settings.speed]);

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

  // Fin de vidéo : suivante (lecture continue) ou boucle.
  useEffect(() => {
    if (activeId == null) return undefined;

    const element = getElement(activeId);

    if (!element) return undefined;

    element.loop = !settings.autoNext;

    const handleEnded = () => {
      if (!goToNext(activeId)) {
        element.currentTime = 0;
        safePlay(element);
      }
    };

    element.addEventListener("ended", handleEnded);

    return () => {
      element.removeEventListener("ended", handleEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey, settings.autoNext]);

  // Images : six secondes puis suivante. Le minuteur est suspendu
  // tant qu'un panneau (commentaires, studio, publication…) est ouvert.
  useEffect(() => {
    if (activeId == null || !settings.autoNext || overlayOpen) {
      return undefined;
    }

    if (!activeVideo || !isImageVideo(activeVideo)) {
      return undefined;
    }

    const timer = setTimeout(() => {
      if (feedVisibleRef.current && !document.hidden) {
        goToNext(activeId);
      }
    }, IMAGE_DURATION_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey, settings.autoNext, overlayOpen]);

  // Barre de progression (modifiée directement dans le DOM : aucun re-rendu).
  useEffect(() => {
    const bar = progressRef.current;

    if (!bar) return undefined;

    bar.style.transition = "none";
    bar.style.transform = "scaleX(0)";

    if (activeId == null) return undefined;

    if (activeVideo && isImageVideo(activeVideo)) {
      if (!settings.autoNext || overlayOpen) return undefined;

      void bar.offsetWidth; // force le recalcul avant l'animation
      bar.style.transition = `transform ${IMAGE_DURATION_MS}ms linear`;
      bar.style.transform = "scaleX(1)";

      return () => {
        bar.style.transition = "none";
        bar.style.transform = "scaleX(0)";
      };
    }

    const element = getElement(activeId);

    if (!element) return undefined;

    const update = () => {
      if (element.duration > 0) {
        bar.style.transform = `scaleX(${Math.min(
          1,
          element.currentTime / element.duration
        )})`;
      }
    };

    bar.style.transition = "transform 250ms linear";
    element.addEventListener("timeupdate", update);
    update();

    return () => element.removeEventListener("timeupdate", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, feedKey, settings.autoNext, overlayOpen, loading]);

  if (loading) {
    return <FeedLoading />;
  }

  // Économie de données : seule la vidéo active est chargée en entier.
  // La suivante n'est préchargée (métadonnées) que si le réseau le permet.
  const activeIndex = Math.max(
    0,
    visibleVideos.findIndex(
      (video) => String(video.id) === String(activeId)
    )
  );

  const getLoadMode = (index) => {
    if (index === activeIndex) return "active";
    if (index === activeIndex + 1 && !dataSaverActive) return "preload";
    return "none";
  };

  const saverActiveStyle = dataSaverActive
    ? "border-emerald-400/40 text-emerald-300"
    : "border-white/20 text-white";

  return (
    <div
      ref={rootRef}
      className="relative flex h-screen w-full flex-col overflow-hidden bg-black"
      style={{ height: "100dvh" }}
    >
      {/* Barre de progression de la publication active */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[75] h-[3px] bg-white/10">
        <div
          ref={progressRef}
          className="h-full origin-left bg-yellow-400"
          style={{ transform: "scaleX(0)" }}
        />
      </div>

      <FeedHeader
        onExit={onExit}
        muted={playback.muted}
        onToggleMute={playback.toggleMute}
        onOpenUpload={openUpload}
        onOpenStudio={() => setStudioOpen(true)}
        showModeSwitcher={false}
        extraActions={(
          <>
        <button
          type="button"
          onClick={cycleSpeed}
          className="flex h-9 items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-xl transition-all hover:bg-black/60 active:scale-95"
          aria-label={`Vitesse de lecture ×${settings.speed}`}
          title="Vitesse de lecture"
        >
          <Gauge size={14} />
          <span>×{settings.speed}</span>
        </button>

        <button
          type="button"
          onClick={cycleDataSaver}
          className={`flex h-9 w-9 items-center justify-center rounded-full border bg-black/40 shadow-lg backdrop-blur-xl transition-all hover:bg-black/60 active:scale-95 ${saverActiveStyle}`}
          aria-label={`Économie de données : ${
            SAVER_LABEL[settings.dataSaver]
          }`}
          title={`Économie de données : ${
            SAVER_LABEL[settings.dataSaver]
          }${dataSaverActive ? " (active)" : ""}`}
        >
          <Leaf size={16} />
        </button>

          </>
        )}
      />

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
          visibleVideos.map((video, index) => {
            const mounted =
              Math.abs(index - activeIndex) <= RENDER_WINDOW;

            return (
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
                {mounted && (
                  <VideoCard
                    video={video}
                    sound={getVideoSound(video)}
                    liked={!!likedMap[video.id]}
                    user={user}
                    playback={playback}
                    actions={actions}
                    isActive={
                      String(video.id) === String(activeId)
                    }
                    loadMode={getLoadMode(index)}
                    dataSaver={dataSaverActive}
                    hideVolumeControl
                    onShowViewers={() =>
                      setViewersVideoId(video.id)
                    }
                  />
                )}
              </div>
            );
          })
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

      {/* Bouton flottant déplaçable : créer une vidéo */}
      <CreateVideoFab onClick={openUpload} hidden={overlayOpen} />

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
        creator={creatorForModal}
        soundPicker={soundPicker}
        camera={camera}
        compression={compression}
        compressUploads={settings.compressUploads}
        onCompressChange={(value) =>
          updateSettings({ compressUploads: value })
        }
      />

      {/* Studio NextGen */}
      <VideoNextGenStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCreate={handleStudioCreate}
        settings={settings}
        onSettingsChange={updateSettings}
        dataSaverActive={dataSaverActive}
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
