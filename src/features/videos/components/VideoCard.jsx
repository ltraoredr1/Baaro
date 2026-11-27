import { useState, useRef, useEffect } from "react";
import {
  Check,
  Clock3,
  Expand,
  Heart,
  MessageCircle,
  Eye,
  Music2,
  Play,
  PlusCircle,
  Repeat2,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
  Radio,
} from "lucide-react";
import { COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";
import { VideoTranslateControls } from "../../../components/VideoTranslateControls.jsx";
import { TipButton } from "../../../components/TipButton.jsx";
import VideoPollWidget from "./VideoPollWidget.jsx";
import VideoProductWidget from "./VideoProductWidget.jsx";
import { baaroLogo } from "../constants.js";
import { feedImageUrl, avatarUrl } from "../../../lib/mediaUrl.js";
import {
  loadGoogleCast,
  isAirPlayAvailable,
  openAirPlay,
  startGoogleCast,
  stopCastSync,
} from "../lib/videoCasting.js";
import { formatCount, formatPublished, formatPublishedFull } from "../utils/format.js";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

// Un média est une image si media_type le dit, ou si l'URL a une extension d'image
export function isImageVideo(video) {
  if (!video) return false;
  if (video.media_type === "image" || video.type === "image") return true;
  const url = video.video_url || video.media_url || "";
  return IMAGE_EXT.test(url);
}

// Une vidéo (ou image) plein écran du flux, avec ses boutons d'action.
// loadMode : "active" (chargement complet), "preload" (métadonnées), "none" (rien).
export default function VideoCard({
  video,
  sound,
  liked,
  user,
  playback,
  actions,
  hideVolumeControl = false,
  isActive = false,
  loadMode = "active",
  dataSaver = false,
  onShowViewers,
  videoWidgetRequest = null,
  onVideoWidgetRequestHandled,
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
    toggleMute,
    toggleFullscreen,
    handleTimeUpdate,
  } = playback;

  const {
    openComments,
    handleRepost,
    handleShare,
    handleDelete,
    handleStory,
    storyBusyId,
    shareId,
    onUseSound,
    onOpenProfile,
  } = actions;

  // Tolère les deux noms possibles selon la version du hook
  const handleLike = actions.handleLike || actions.toggleLike;

  const [captionOpen, setCaptionOpen] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [airPlayAvailable, setAirPlayAvailable] = useState(false);
  const [castBusy, setCastBusy] = useState(false);

  useEffect(() => {
    const videoEl = videoRefs.current[video.id];
    const audioEl = audioRefs.current[video.id];
    if (videoEl) {
      videoEl.volume = Math.max(0, Math.min(1, Number(video.original_volume ?? 1)));
    }
    if (audioEl) {
      audioEl.volume = Math.max(0, Math.min(1, Number(video.sound_volume ?? 1)));
    }
  }, [video.id, video.original_volume, video.sound_volume, sound?.url, videoRefs, audioRefs]);

  const clickTimeoutRef = useRef(null);
  const heartTimeoutRef = useRef(null);
  const lastClickTimeRef = useRef(0);
  const draggingRef = useRef(false);

  const id = String(video.id);
  const isImage = isImageVideo(video);
  const shouldLoad = loadMode !== "none";

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (heartTimeoutRef.current) clearTimeout(heartTimeoutRef.current);
    };
  }, []);

  // Charge automatiquement les sous-titres déjà générés à la publication.
  // La lecture reste publique grâce à la politique SELECT de video_captions.
  useEffect(() => {
    if (isImage || !isActive || !shouldLoad) return undefined;

    const videoEl = videoRefs.current[video.id];
    if (!videoEl) return undefined;

    let cancelled = false;
    let autoTrack = null;

    const loadAutomaticCaptions = async () => {
      try {
        const { data, error } = await supabase
          .from("video_captions")
          .select("language,vtt_url")
          .eq("video_id", video.id)
          .eq("kind", "translated")
          .eq("status", "ready")
          .not("vtt_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (cancelled || !data?.vtt_url) return;

        let captionUrl;
        try {
          captionUrl = new URL(data.vtt_url);
        } catch {
          return;
        }

        if (captionUrl.protocol !== "https:" && captionUrl.protocol !== "http:") {
          return;
        }

        // Ne remplace jamais une piste ajoutée manuellement par le spectateur.
        if (videoEl.querySelector('track[data-baaro-auto-caption="1"]')) return;

        autoTrack = document.createElement("track");
        autoTrack.kind = "subtitles";
        autoTrack.label = `BAARO · ${String(data.language || "fr").toUpperCase()}`;
        autoTrack.srclang = String(data.language || "fr").toLowerCase().split("-")[0];
        autoTrack.src = captionUrl.toString();
        autoTrack.default = true;
        autoTrack.dataset.baaroAutoCaption = "1";

        const showTrack = () => {
          if (!cancelled && autoTrack?.track) {
            autoTrack.track.mode = "showing";
          }
        };

        autoTrack.addEventListener("load", showTrack, { once: true });
        videoEl.appendChild(autoTrack);
        showTrack();
      } catch (error) {
        console.warn("BAARO sous-titres automatiques indisponibles :", error);
      }
    };

    loadAutomaticCaptions();

    return () => {
      cancelled = true;
      if (autoTrack?.parentNode) autoTrack.parentNode.removeChild(autoTrack);
    };
  }, [video.id, isImage, isActive, shouldLoad, videoRefs]);

  const mediaSrc =
    video.media_url || video.video_url || video.image_url || video.thumbnail_url;
  const isPlaying = playingId === id;
  const profile = video.profiles || {};
  const caption = [video.title, video.description].filter(Boolean).join(" · ");
  const handleClean = profile.handle?.replace(/^@/, "") || "membre";

  const authorId = video.author_id || video.user_id || profile.id;
  const isOwner = !!user?.id && authorId === user.id;
  const canTip = !!user?.id && !!authorId && !isOwner;

  // Aucun téléchargement anticipé : la lecture déclenche elle-même le chargement.
  const videoPreload = "none";

  useEffect(() => {
    if (isImage || !isActive || !shouldLoad) return;

    let cancelled = false;
    const videoEl = videoRefs.current[video.id];

    setAirPlayAvailable(isAirPlayAvailable(videoEl));

    loadGoogleCast().then((available) => {
      if (!cancelled) setCastAvailable(Boolean(available));
    }).catch(() => {
      if (!cancelled) setCastAvailable(false);
    });

    return () => {
      cancelled = true;
      stopCastSync(videoEl);
    };
  }, [video.id, isImage, isActive, shouldLoad, videoRefs]);

  const handleCast = async (keepLocal) => {
    const videoEl = videoRefs.current[video.id];
    if (!videoEl || castBusy) return;

    setCastBusy(true);

    try {
      await startGoogleCast(videoEl, keepLocal);
      if (!keepLocal) audioRefs.current[video.id]?.pause();
    } catch (error) {
      window.alert(error?.message || "Impossible de démarrer la diffusion.");
    } finally {
      setCastBusy(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;

    const openCastFromHeader = () => {
      if (!castAvailable) {
        window.alert("Google Cast n'est pas disponible pour cette vidéo.");
        return;
      }
      handleCast(false);
    };

    window.addEventListener("baaro:cast-active-video", openCastFromHeader);
    return () => {
      window.removeEventListener("baaro:cast-active-video", openCastFromHeader);
    };
  }, [isActive, castAvailable, castBusy]);

  const handleAirPlay = () => {
    try {
      openAirPlay(videoRefs.current[video.id]);
    } catch (error) {
      window.alert(error?.message || "AirPlay indisponible.");
    }
  };


  // Hors de la zone de chargement : on coupe la lecture et on libère le réseau et la mémoire.
  useEffect(() => {
    if (loadMode !== "none" || isImage) return;
    const el = videoRefs.current[video.id];
    if (el) {
      el.pause();
      try {
        el.load();
      } catch {
        // rien à libérer
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMode]);

  // Le son associé ne joue que pour la vidéo active.
  useEffect(() => {
    if (!isActive) {
      audioRefs.current[video.id]?.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // --- PLAY / PAUSE direct sur l'élément (indépendant du hook) ---
  const togglePlayPause = () => {
    if (isImage || !isActive) return;
    const el = videoRefs.current[video.id];
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  // --- TAP (play/pause) ET DOUBLE-TAP (like) ---
  const handleCardClick = (e) => {
    e.stopPropagation();
    if (!isActive) return;

    const now = Date.now();
    const delta = now - lastClickTimeRef.current;

    if (delta > 0 && delta < 300) {
      // DOUBLE TAP : LIKE + ANIMATION
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      lastClickTimeRef.current = 0;
      setShowHeartAnim(true);
      if (heartTimeoutRef.current) clearTimeout(heartTimeoutRef.current);
      heartTimeoutRef.current = setTimeout(() => setShowHeartAnim(false), 800);
      if (!liked) handleLike?.(video.id);
    } else {
      // SIMPLE TAP : PLAY / PAUSE
      lastClickTimeRef.current = now;
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        togglePlayPause();
        clickTimeoutRef.current = null;
      }, 300);
    }
  };

  // --- SCRUBBING (tap + glisser, souris et tactile) ---
  const seekToPointer = (e) => {
    const videoEl = videoRefs.current[video.id];
    if (!videoEl || !videoEl.duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = ratio * videoEl.duration;

    const audioEl = audioRefs.current[video.id];
    if (audioEl) syncAudioTime(videoEl, audioEl);
  };

  const handleSeekStart = (e) => {
    e.stopPropagation();
    draggingRef.current = true;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture non supportée : le glisser reste limité à la barre
    }
    seekToPointer(e);
  };

  const handleSeekMove = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    seekToPointer(e);
  };

  const handleSeekEnd = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // déjà relâché
    }
  };

  return (
    <article
      className="relative h-full w-full bg-black overflow-hidden select-none"
      onClick={handleCardClick}
    >
      {isImage ? (
        shouldLoad ? (
          <img
            src={feedImageUrl(mediaSrc)}
            alt={caption || "Image BAARO"}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : null
      ) : (
        <video
          ref={(el) => {
            if (el) videoRefs.current[video.id] = el;
            else delete videoRefs.current[video.id];
          }}
          data-id={id}
          src={shouldLoad ? (dataSaver && video.video_mobile_url ? video.video_mobile_url : (video.video_url || video.media_url)) : undefined}
          poster={video.thumbnail_url ? feedImageUrl(video.thumbnail_url) : undefined}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          crossOrigin="anonymous"
          muted={muted || !!video.mute_original}
          data-mute-original={video.mute_original ? "1" : "0"}
          loading="lazy"
          preload={videoPreload}
          onPlay={(event) => {
            // Sécurité : une vidéo qui n'est plus active ne doit jamais jouer.
            if (!isActive) {
              event.currentTarget.pause();
              audioRefs.current[video.id]?.pause();
              return;
            }
            setPlayingId(id);
            playAudioFor(video.id, event.currentTarget);
          }}
          onPause={() => {
            setPlayingId((current) => (current === id ? null : current));
            audioRefs.current[video.id]?.pause();
          }}
          onEnded={() => {
            const audio = audioRefs.current[video.id];
            if (audio) {
              audio.pause();
              try { audio.currentTime = 0; } catch {}
            }
            setPlayingId((current) => (current === id ? null : current));
          }}
          onSeeked={(event) =>
            syncAudioTime(event.currentTarget, audioRefs.current[video.id])
          }
          onTimeUpdate={(event) => {
            if (isActive) handleTimeUpdate(video.id, event);
          }}
          onError={() => {
            if (shouldLoad) {
              setVideoErrors((prev) => ({ ...prev, [video.id]: true }));
            }
          }}
        />
      )}

      {sound && shouldLoad && (
        <audio
          ref={(el) => {
            if (el) audioRefs.current[video.id] = el;
            else delete audioRefs.current[video.id];
          }}
          src={sound.url}
          loop
          preload={loadMode === "active" ? "metadata" : "none"}
          muted={muted}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 pointer-events-none" />

      {/* Animation cœur au double-tap */}
      {showHeartAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 animate-ping">
          <Heart
            size={96}
            className="text-pink-500 fill-pink-500 drop-shadow-lg"
          />
        </div>
      )}

      {!isImage && videoErrors[video.id] && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 text-center px-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="font-black text-lg">Vidéo indisponible</p>
            <p className="text-xs text-white/50 mt-2 mb-5">
              Le fichier n&apos;a pas pu être lu.
            </p>
            <button
              type="button"
              onClick={() => {
                setVideoErrors((prev) => {
                  const copy = { ...prev };
                  delete copy[video.id];
                  return copy;
                });
                const el = videoRefs.current[video.id];
                if (el) {
                  el.load();
                  if (isActive) el.play().catch(() => {});
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

      {!isImage && !isPlaying && !videoErrors[video.id] && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="h-16 w-16 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Play size={30} fill="white" className="ml-1" />
          </span>
        </div>
      )}

      {video.is_repost && (
        <div className="absolute top-28 left-4 z-20 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-yellow-400/30 text-yellow-300 text-[10px] font-black flex items-center gap-1.5">
          <Repeat2 size={12} />
          REPOST
        </div>
      )}

      {/* Infos auteur + légende + son */}
      <div
        className="absolute left-3 right-20 bottom-28 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex items-center gap-2 mb-2 text-left rounded-xl p-1 -ml-1 hover:bg-white/10 active:scale-[.98] transition"
          onClick={() => authorId && onOpenProfile?.(authorId)}
          disabled={!authorId}
          aria-label={`Voir le profil de ${profile.display_name || handleClean}`}
        >
          <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white bg-zinc-800 shrink-0">
            {profile.avatar_url ? (
              <img
                src={avatarUrl(profile.avatar_url, 160)}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
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

          <span className="min-w-0">
            <span className="font-black text-sm truncate block">
              @{handleClean} {profile.flag || ""}
            </span>
            <span className="text-[10px] text-white/50 truncate block">
              {profile.display_name || "Membre BAARO"}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCaptionOpen(!captionOpen)}
          className="text-left"
        >
          <p
            className={`text-sm font-medium leading-snug ${
              captionOpen ? "" : "line-clamp-2"
            }`}
          >
            {caption || "Publication BAARO"}
          </p>

          {caption.length > 90 && (
            <span className="text-[10px] text-white/50">
              {captionOpen ? "Réduire" : "Plus"}
            </span>
          )}
        </button>

        {!isImage && isActive && (
          <div className="mt-2">
            <VideoTranslateControls
              mediaUrl={video.media_url || video.video_url}
              videoId={video.id}
              videoRef={{ current: videoRefs.current[video.id] }}
              audioRefs={audioRefs}
              audioId={video.id}
              userMuted={muted}
              muteOriginal={!!video.mute_original}
            />
          </div>
        )}

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
            type="button"
            onClick={() => onUseSound?.(video, sound)}
            className="shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black shadow-lg active:scale-95"
            style={{ background: COLORS.gold, color: "#000" }}
            aria-label="Utiliser ce son pour créer une vidéo"
          >
            <Music2 size={12} />
            Utiliser ce son
          </button>
        </div>
        <VideoPollWidget
          video={video}
          user={user}
          isOwner={isOwner}
          openCreateRequest={videoWidgetRequest?.type === "poll" ? videoWidgetRequest.requestId : null}
          onCreateRequestHandled={onVideoWidgetRequestHandled}
        />
        <VideoProductWidget
          video={video}
          user={user}
          isOwner={isOwner}
          openCreateRequest={videoWidgetRequest?.type === "product" ? videoWidgetRequest.requestId : null}
          onCreateRequestHandled={onVideoWidgetRequestHandled}
        />
      </div>

      {/* Colonne d'actions (droite) */}
      <div
        className="absolute right-3 bottom-28 z-30 flex w-11 flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => handleLike?.(video.id)}
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
          type="button"
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
          type="button"
          onClick={() => handleRepost(video)}
          className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
          aria-label="Reposter"
        >
          <Repeat2 size={21} />
        </button>

        <button
          type="button"
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

        {/* POURBOIRE : visible pour tout le monde sauf l'auteur */}
        {canTip && (
          <TipButton recipientId={authorId} videoId={video.id} iconOnly />
        )}

        {!isImage && isActive && airPlayAvailable && (
          <div className="relative">
            {airPlayAvailable && (
              <button
                type="button"
                onClick={handleAirPlay}
                className="mt-2 h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                aria-label="Diffuser avec AirPlay"
                title="AirPlay"
              >
                <Radio size={20} />
              </button>
            )}
          </div>
        )}

        {!isImage && (
          <button
            type="button"
            onClick={() => toggleFullscreen(video.id)}
            className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
            aria-label="Plein écran"
          >
            <Expand size={20} />
          </button>
        )}

        {isOwner && handleStory && (
          <button
            type="button"
            onClick={() => handleStory(video, { isImage })}
            disabled={storyBusyId === video.id}
            className="flex flex-col items-center disabled:opacity-50"
            aria-label="Publier en story"
          >
            <span className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
              <PlusCircle size={21} />
            </span>
            <span className="text-[10px] font-black mt-1">Story</span>
          </button>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Supprimer cette vidéo ?")) handleDelete(video.id);
            }}
            className="mt-3 h-11 w-11 rounded-full bg-red-500/20 backdrop-blur-md flex items-center justify-center"
            aria-label="Supprimer"
          >
            <Trash2 size={19} className="text-red-300" />
          </button>
        )}
      </div>

      {/* Barre de progression : tap ou glisser (vidéos uniquement) */}
      {!isImage && (
        <div
          className="absolute left-3 right-3 bottom-[88px] z-30 h-7 flex items-end pb-2 cursor-pointer"
          style={{ touchAction: "none" }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleSeekStart}
          onPointerMove={handleSeekMove}
          onPointerUp={handleSeekEnd}
          onPointerCancel={handleSeekEnd}
        >
          <div
            className={`w-full rounded-full bg-white/20 overflow-hidden transition-[height] ${
              dragging ? "h-2" : "h-1"
            }`}
          >
            <div
              className={`h-full ${
                dragging ? "" : "transition-[width] duration-100"
              }`}
              style={{
                width: `${(progress[video.id] || 0) * 100}%`,
                background: COLORS.gold,
              }}
            />
          </div>
        </div>
      )}

      <div
        className="absolute bottom-8 left-3 right-3 z-30 flex items-center justify-between text-[10px] text-white/65"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-1">
          {!isImage && (
            <>
              <Clock3 size={12} />
              {video.duration || "00:00"}
            </>
          )}
        </span>

        {isOwner && (
          <button
            type="button"
            onClick={() => onShowViewers?.(video.id)}
            className="flex items-center gap-1 underline text-white"
            aria-label="Voir les spectateurs de cette vidéo"
          >
            <Eye size={13} />
            Voir les spectateurs
          </button>
        )}

        <div className="flex items-center gap-2">
          <span>
            {formatCount(video.views)} vues
            {video.created_at && (
              <span title={formatPublishedFull(video.created_at)}> · {formatPublished(video.created_at)}</span>
            )}
          </span>
          {!hideVolumeControl && !isImage && (
            <button
              type="button"
              onClick={() => toggleMute()}
              className="h-8 w-8 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center"
              aria-label={muted ? "Activer le son" : "Couper le son"}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
