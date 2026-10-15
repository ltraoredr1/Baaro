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
      {/* CONTENEUR PRINCIPAL NET ALIGNÉ SUR LE HEADER GLOBAL */}
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 pb-20 pt-2">
        {/* LISTE DES VIDÉOS */}
        {loadError ? (
          <FeedError message={loadError} onRetry={loadVideos} />
        ) : visibleVideos.length === 0 ? (
          <FeedEmpty onPublish={openUpload} />
        ) : (
          <div className="flex flex-col gap-6">
            {visibleVideos.map((video) => (
              <div key={video.id} className="relative rounded-2xl overflow-hidden border border-white/10 bg-black shadow-xl">
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
                  <div className="absolute bottom-4 right-4 z-30">
                    <TipButton recipientId={video.user_id} videoId={video.id} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
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
