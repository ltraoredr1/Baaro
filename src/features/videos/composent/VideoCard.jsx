import { useState } from "react";
import {
  Check,
  Clock3,
  Expand,
  Heart,
  MessageCircle,
  Music2,
  Play,
  Repeat2,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { COLORS } from "../../../theme.js";
import { VideoTranslateControls } from "../../../components/VideoTranslateControls.jsx";
import { baaroLogo } from "../constants.js";
import { formatCount } from "../utils/format.js";

// Une vidéo plein écran du flux, avec ses boutons d'action.
// playback : retour de useFeedPlayback — actions : like, commentaires, repost, partage…
export default function VideoCard({
  video,
  sound,
  liked,
  user,
  playback,
  actions,
}) {
  const {
    videoRefs,
    audioRefs,
    playingId,
    setPlayingId,
    muted,
    progress,
    videoErrors,
    setVideoErrors,
    syncAudioTime,
    playAudioFor,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    handleTimeUpdate,
  } = playback;
  const {
    handleLike,
    openComments,
    handleRepost,
    handleShare,
    handleDelete,
    shareId,
    onUseSound,
  } = actions;

  const [captionOpen, setCaptionOpen] = useState(false);

  const id = String(video.id);
  const isPlaying = playingId === id;
  const profile = video.profiles || {};
  const caption = [video.title, video.description].filter(Boolean).join(" · ");
  const handleClean = profile.handle?.replace(/^@/, "") || "membre";

  return (
    <article
      key={video.id}
      className="relative h-[100dvh] min-h-[620px] w-full snap-start bg-black overflow-hidden"
    >
      <video
        ref={(el) => {
          if (el) videoRefs.current[video.id] = el;
        }}
        data-id={id}
        src={video.video_url}
        poster={video.thumbnail_url || undefined}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        loop
        muted={muted || !!video.mute_original}
        data-mute-original={video.mute_original ? "1" : "0"}
        preload="metadata"
        onPlay={(event) => {
          setPlayingId(id);
          playAudioFor(video.id, event.currentTarget);
        }}
        onPause={() => {
          setPlayingId((current) => (current === id ? null : current));
          audioRefs.current[video.id]?.pause();
        }}
        onSeeked={(event) =>
          syncAudioTime(event.currentTarget, audioRefs.current[video.id])
        }
        onTimeUpdate={(event) => handleTimeUpdate(video.id, event)}
        onError={() =>
          setVideoErrors((prev) => ({ ...prev, [video.id]: true }))
        }
        onClick={() => togglePlay(video.id)}
      />

      {sound && (
        <audio
          ref={(el) => {
            if (el) audioRefs.current[video.id] = el;
            else delete audioRefs.current[video.id];
          }}
          src={sound.url}
          loop
          preload="auto"
          muted={muted}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 pointer-events-none" />

      {videoErrors[video.id] && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 text-center px-6">
          <div>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="font-black text-lg">Vidéo indisponible</p>
            <p className="text-xs text-white/50 mt-2 mb-5">
              Le fichier n'a pas pu être lu.
            </p>
            <button
              onClick={() => {
                setVideoErrors((prev) => {
                  const copy = { ...prev };
                  delete copy[video.id];
                  return copy;
                });
                const el = videoRefs.current[video.id];
                if (el) {
                  el.load();
                  el.play().catch(() => {});
                }
              }}
              className="px-5 py-2.5 rounded-xl font-bold"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {!isPlaying && !videoErrors[video.id] && (
        <button
          onClick={() => togglePlay(video.id)}
          className="absolute inset-0 z-10 flex items-center justify-center"
          aria-label="Lire la vidéo"
        >
          <span className="h-16 w-16 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Play size={30} fill="white" className="ml-1" />
          </span>
        </button>
      )}

      {video.is_repost && (
        <div className="absolute top-24 left-4 z-20 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-yellow-400/30 text-yellow-300 text-[10px] font-black flex items-center gap-1.5">
          <Repeat2 size={12} />
          REPOST
        </div>
      )}

      <div className="absolute left-3 right-20 bottom-28 z-20">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white bg-zinc-800 shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={baaroLogo}
                alt="BAARO"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-black text-sm truncate">
              @{handleClean} {profile.flag || ""}
            </div>
            <div className="text-[10px] text-white/50 truncate">
              {profile.display_name || "Membre BAARO"}
            </div>
          </div>
        </div>

        <button
          onClick={() => setCaptionOpen(!captionOpen)}
          className="text-left"
        >
          <p
            className={`text-sm font-medium leading-snug ${captionOpen ? "" : "line-clamp-2"}`}
          >
            {caption || "Vidéo BAARO"}
          </p>

          {caption.length > 90 && (
            <span className="text-[10px] text-white/50">
              {captionOpen ? "Réduire" : "Plus"}
            </span>
          )}
        </button>

        <div className="mt-2">
          <VideoTranslateControls
            mediaUrl={video.media_url || video.video_url}
            videoId={video.id}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-white/65 min-w-0 flex-1">
            <Music2 size={13} className="shrink-0" />
            <span className="truncate">
              {sound
                ? `${sound.title}${sound.artist ? ` · ${sound.artist}` : ""}`
                : "Son original"}
            </span>
          </div>
          <button
            onClick={() => onUseSound?.(video, sound)}
            className="shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black shadow-lg active:scale-95"
            style={{ background: COLORS.gold, color: "#000" }}
            aria-label="Utiliser ce son pour créer une vidéo"
          >
            <Music2 size={12} />
            Utiliser ce son
          </button>
        </div>
      </div>

      <div className="absolute right-2 bottom-28 z-30 flex flex-col items-center gap-3">
        <button
          onClick={() => handleLike(video.id)}
          className="flex flex-col items-center"
          aria-label="J'aime"
        >
          <span
            className={`h-11 w-11 rounded-full backdrop-blur-md flex items-center justify-center ${
              liked ? "bg-pink-500/25" : "bg-white/10"
            }`}
          >
            <Heart
              size={22}
              className={liked ? "text-pink-500" : "text-white"}
              fill={liked ? "currentColor" : "none"}
            />
          </span>
          <span className="text-[10px] font-black mt-1">
            {formatCount(video.likes)}
          </span>
        </button>

        <button
          onClick={() => openComments(video.id)}
          className="flex flex-col items-center"
          aria-label="Commentaires"
        >
          <span className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
            <MessageCircle size={21} />
          </span>
          <span className="text-[10px] font-black mt-1">
            {formatCount(video.comments_count)}
          </span>
        </button>

        <button
          onClick={() => handleRepost(video)}
          className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
          aria-label="Reposter"
        >
          <Repeat2 size={21} />
        </button>

        <button
          onClick={() => handleShare(video)}
          className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
          aria-label="Partager"
        >
          {shareId === video.id ? (
            <Check size={21} className="text-green-400" />
          ) : (
            <Share2 size={21} />
          )}
        </button>

        <button
          onClick={() => toggleFullscreen(video.id)}
          className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
          aria-label="Plein écran"
        >
          <Expand size={20} />
        </button>

        {video.author_id === user?.id && (
          <button
            onClick={() => handleDelete(video.id)}
            className="h-11 w-11 rounded-full bg-red-500/20 backdrop-blur-md flex items-center justify-center"
            aria-label="Supprimer"
          >
            <Trash2 size={19} className="text-red-300" />
          </button>
        )}
      </div>

      <div className="absolute left-3 right-3 bottom-24 z-30 h-1 rounded-full bg-white/20 overflow-hidden pointer-events-none">
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${(progress[video.id] || 0) * 100}%`,
            background: COLORS.gold,
          }}
        />
      </div>

      <div className="absolute bottom-8 left-3 right-3 z-30 flex items-center justify-between text-[10px] text-white/55">
        <span className="flex items-center gap-1">
          <Clock3 size={12} />
          {video.duration || "00:00"}
        </span>

        <div className="flex items-center gap-2">
          <span>{formatCount(video.views)} vues</span>
          <button
            onClick={() => toggleMute()}
            className="h-8 w-8 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </div>
    </article>
  );
}
