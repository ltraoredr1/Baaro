import { useEffect, useRef, useState } from "react";
import CommentsSheet from "./composent/CommentsSheet.jsx";
import { FeedEmpty, FeedError, FeedLoading } from "./composent/FeedStatus.jsx";
import UploadModal from "./composent/UploadModal.jsx";
import VideoCard from "./composent/VideoCard.jsx";
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
import { TipButton } from "../../components/TipButton.jsx";
import { Volume2, VolumeX, Sparkles } from "lucide-react";

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

  // Écouter le clic sur le bouton "+" du Header lorsque l'onglet actif est Vidéos
  useEffect(() => {
    const handleGlobalVideoCreate = () => {
      openUpload();
    };
    window.addEventListener("baaro:open-video-create", handleGlobalVideoCreate);
    return () => {
      window.removeEventListener("baaro:open-video-create", handleGlobalVideoCreate);
    };
  }, [creator]);

  const handleUseSound = (video, sound) => {
    const handle = video.profiles?.handle?.replace(/^@/, "") || "membre";
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
    openComments: commentsState.openComments,
    onUseSound: handleUseSound,
  };

  const [studioOpen, setStudioOpen] = useState(false);
  const [viewersVideoId, setViewersVideoId] = useState(null);

  // Intégration des fonctionnalités sélectionnées dans le studio NextGen
  const handleStudioCreate = (selectedFeatures) => {
    setStudioOpen(false);
    if (selectedFeatures && selectedFeatures.length > 0) {
      showToast(`${selectedFeatures.length} outils Studio activés`, "info");
    }
    openUpload();
  };

  // --- GESTION CLICK SIMPLE (PAUSE/LECTURE) & DOUBLE-TAP (LIKE) ---
  const clickTimeoutRef = useRef(null);
  const lastClickTimeRef = useRef(0);

  const handleVideoTouchOrClick = (e, video) => {
    e.stopPropagation();
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastClickTimeRef.current;

    if (tapLength < 300 && tapLength > 0) {
      // --- DOUBLE TAP : LIKE ---
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      if (!likedMap[video.id]) {
        videoActions.toggleLike(video.id);
      }
      lastClickTimeRef.current = 0;
    } else {
      // --- SIMPLE TAP : TOGGLE PLAY / PAUSE ---
      lastClickTimeRef.current = currentTime;
      clickTimeoutRef.current = setTimeout(() => {
        handleTogglePlayPause(video.id);
        clickTimeoutRef.current = null;
      }, 300);
    }
  };

  const handleTogglePlayPause = (videoId) => {
    // Méthode unifiée compatible avec Chrome mobile / Chrome desktop
    if (playback?.togglePlayPause) {
      playback.togglePlayPause(videoId);
    } else if (playback?.togglePlay) {
      playback.togglePlay(videoId);
    } else {
      const el = playback?.videoRefs?.current?.[videoId];
      if (el) {
        if (el.paused) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      }
    }
  };

  if (loading) return <FeedLoading />;

  return (
    <div className="relative w-full h-screen h-[calc(100vh-env(safe-area-inset-top))] overflow-hidden bg-black flex flex-col">
      
      {/* BOUTON HAUT-PARLEUR FIXÉ EN HAUT À DROITE (UNIQUE BOUTON SON) */}
      <div className="absolute top-4 right-4 z-[70] flex items-center gap-2">
        <button
          onClick={() => setStudioOpen(true)}
          className="h-9 px-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center gap-1.5 text-xs font-bold text-white shadow-lg hover:bg-black/60 transition-all active:scale-95"
          title="Studio NextGen"
        >
          <Sparkles size={14} className="text-yellow-400" />
          <span>Studio</span>
        </button>

        <button
          onClick={playback.toggleMute}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-lg hover:bg-black/60 transition-all active:scale-95"
          aria-label={playback.muted ? "Activer le son" : "Couper le son"}
          title={playback.muted ? "Activer le son" : "Couper le son"}
        >
          {playback.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </div>

      {/* CONTENEUR MAGNÉTIQUE PLEIN ÉCRAN */}
      <div className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none flex flex-col bg-black">
        {loadError ? (
          <div className="flex items-center justify-center h-full">
            <FeedError message={loadError} onRetry={loadVideos} />
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <FeedEmpty onPublish={openUpload} />
          </div>
        ) : (
          visibleVideos.map((video) => (
            <div 
              key={video.id} 
              className="relative w-full h-full h-screen shrink-0 snap-start snap-always flex items-center justify-center bg-black overflow-hidden"
            >
              <div 
                className="w-full h-full relative flex items-center justify-center overflow-hidden cursor-pointer select-none"
                onClick={(e) => handleVideoTouchOrClick(e, video)}
              >
                <VideoCard
                  video={video}
                  sound={getVideoSound(video)}
                  liked={!!likedMap[video.id]}
                  user={user}
                  playback={playback}
                  actions={actions}
                  hideVolumeControl={true} /* Masque le bouton son du composant enfant pour éviter le doublon */
                  onShowViewers={() => setViewersVideoId(video.id)}
                />

                {/* BOUTON POURBOIRE (TIP) */}
                {user?.id && video.user_id && video.user_id !== user.id && (
                  <div 
                    className="absolute bottom-24 right-4 z-30"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TipButton recipientId={video.user_id} videoId={video.id} compact />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODALES & OVERLAYS */}
      {commentsState.showComments && (
        <CommentsSheet
          comments={
            commentsState.comments[commentsState.showComments] || []
          }
          newComment={commentsState.newComment}
          setNewComment={commentsState.setNewComment}
          onSend={commentsState.sendComment}
          onClose={commentsState.closeComments}
        />
      )}

      <UploadModal
        creator={creator}
        soundPicker={soundPicker}
        camera={camera}
      />

      {/* STUDIO NEXTGEN BRANCHÉ */}
      <VideoNextGenStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCreate={handleStudioCreate}
      />

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
