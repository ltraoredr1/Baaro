import { useState } from "react";
import CommentsSheet from "./components/CommentsSheet.jsx";
import FeedHeader from "./components/FeedHeader.jsx";
import { FeedEmpty, FeedError, FeedLoading } from "./components/FeedStatus.jsx";
import UploadModal from "./components/UploadModal.jsx";
import VideoCard from "./components/VideoCard.jsx";
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
    mode,
    setMode,
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
  const commentsState = useVideoComments({ user, setVideos, onRewardPoints });
  const { showToast } = useToast();

  const openUpload = () => creator.setShowUpload(true);

  // « Utiliser ce son » : crée une vidéo avec le son de la vidéo vue.
  // Son choisi de la vidéo si elle en a un, sinon l'audio de la vidéo elle-même.
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

  // Studio NextGen : « Continuer » ferme le studio et ouvre la publication.
  // tools = clés des outils cochés (ex. ["ai", "remix"]) ; pas encore exploitées.
  const [studioOpen, setStudioOpen] = useState(false);
  const handleStudioCreate = () => {
    setStudioOpen(false);
    openUpload();
  };

  if (loading) return <FeedLoading />;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black text-white overflow-y-auto snap-y snap-mandatory no-scrollbar"
        style={{
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <FeedHeader
          onExit={onExit}
          muted={playback.muted}
          onToggleMute={playback.toggleMute}
          onOpenUpload={openUpload}
          onOpenStudio={() => setStudioOpen(true)}
          mode={mode}
          setMode={setMode}
        />

        {loadError ? (
          <FeedError message={loadError} onRetry={loadVideos} />
        ) : visibleVideos.length === 0 ? (
          <FeedEmpty onPublish={openUpload} />
        ) : (
          visibleVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              sound={getVideoSound(video)}
              liked={!!likedMap[video.id]}
              user={user}
              playback={playback}
              actions={actions}
            />
          ))
        )}
      </div>

      {commentsState.showComments && (
        <CommentsSheet
          comments={commentsState.comments[commentsState.showComments] || []}
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
    </>
  );
}

export default VideosTab;
