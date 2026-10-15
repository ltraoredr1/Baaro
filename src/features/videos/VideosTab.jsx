import { useState } from "react";
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

  if (loading) return <FeedLoading />;

  return (
    <>
      {/* CONTENEUR MAGNÉTIQUE PLEIN ÉCRAN (SNAP VERTICAL) */}
      <div className="w-full h-[calc(100vh-env(safe-area-inset-top))] overflow-y-scroll snap-y snap-mandatory scrollbar-none flex flex-col bg-black">
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
              className="relative w-full h-[calc(100vh-env(safe-area-inset-top))] shrink-0 snap-start snap-always flex items-center justify-center bg-black"
            >
              <div className="w-full h-full max-w-2xl relative flex items-center justify-center overflow-hidden">
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
                  <div className="absolute bottom-20 right-4 z-30">
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
    </>
  );
}

export default VideosTab;
