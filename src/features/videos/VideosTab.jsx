import { useEffect, useState } from "react";
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
import { Volume2, VolumeX } from "lucide-react";

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

  const handleStudioCreate = () => {
    setStudioOpen(false);
    openUpload();
  };

  // Gestion de la pause/lecture manuelle
  const handleVideoClick = (videoId) => {
    if (playback?.togglePlayPause) {
      playback.togglePlayPause(videoId);
    } else if (playback?.togglePlay) {
      playback.togglePlay(videoId);
    } else if (playback?.videoRefs?.current?.[videoId]) {
      const el = playback.videoRefs.current[videoId];
      if (el.paused) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
  };

  if (loading) return <FeedLoading />;

  return (
    <div className="relative w-full h-[calc(100vh-env(safe-area-inset-top))] overflow-hidden bg-black flex flex-col">
      
      {/* BOUTON HAUT-PARLEUR FIXÉ EN HAUT À DROITE */}
      <div className="absolute top-4 right-4 z-[70] flex items-center">
        <button
          onClick={playback.toggleMute}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-lg hover:bg-black/60 transition-all active:scale-95"
          aria-label={playback.muted ? "Activer le son" : "Couper le son"}
          title={playback.muted ? "Activer le son" : "Couper le son"}
        >
          {playback.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </div>

      {/* CONTENEUR MAGNÉTIQUE PLEIN ÉCRAN (SNAP VERTICAL) */}
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
              className="relative w-full h-full shrink-0 snap-start snap-always flex items-center justify-center bg-black"
            >
              <div 
                className="w-full h-full max-w-2xl relative flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => handleVideoClick(video.id)}
              >
                <VideoCard
                  video={video}
                  sound={getVideoSound(video)}
                  liked={!!likedMap[video.id]}
                  user={user}
                  playback={playback}
                  actions={actions}
                  onShowViewers={() => setViewersVideoId(video.id)}
                />

                {/* BOUTON POURBOIRE (TIP) */}
                {user?.id && video.user_id && video.user_id !== user.id && (
                  <div 
                    className="absolute bottom-20 right-4 z-30"
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
