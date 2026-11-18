import { useState, useRef, useEffect } from "react";
import {
  Languages,
  Loader2,
  Captions,
  AudioLines,
  ChevronDown,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { translationLang } from "../../i18n.js";
import { COLORS } from "../theme.js";
import { TRANSLATE_LANGS, translateMedia } from "../lib/translateApi.js";
import { useToast } from "./ToastContext.jsx";

/**
 * Contrôles de traduction pour une vidéo BAARO.
 */
export function VideoTranslateControls({
  mediaUrl,
  videoId,
  videoRef,
  audioRefs,
  audioId,
  preferredLang,
  // Préférence de son de l'utilisateur (bouton muet du flux). Si elle est fournie,
  // c'est elle qui décide du son pendant et après le doublage.
  userMuted,
  muteOriginal = false,
}) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const uiLang = preferredLang || translationLang(i18n.language);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("subtitles"); // subtitles | dub
  const [active, setActive] = useState(null); // { targetLang, vttUrl, dubAudioUrl, ... }
  const menuRef = useRef(null);
  const dubAudioRef = useRef(null);
  const hiddenTracksRef = useRef([]);

  const userMutedRef = useRef(userMuted);
  userMutedRef.current = userMuted;
  const muteOriginalRef = useRef(muteOriginal);
  muteOriginalRef.current = muteOriginal;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Abandon du doublage seul (les sous-titres éventuels restent) : l'effet de
  // synchronisation se démonte alors et rend le son d'origine.
  const dropDubRef = useRef(() => {});
  dropDubRef.current = () => {
    setActive((prev) => (prev ? { ...prev, dubAudioUrl: null } : prev));
    showToastRef.current?.(t("video_translate.dub_unavailable"), "error");
  };

  const dubUrl = active?.dubAudioUrl || null;
  // Dépendre de l'élément (stable) et non de l'objet videoRef, recréé à chaque rendu
  // de la carte : l'effet se relançait plusieurs fois par seconde.
  const videoEl = videoRef?.current || null;

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Le son suit la préférence de l'utilisateur pendant le doublage.
  useEffect(() => {
    const dub = dubAudioRef.current;
    if (dub && dubUrl && typeof userMuted === "boolean") dub.muted = userMuted;
  }, [userMuted, dubUrl]);

  // Synchronisation du doublage avec la vidéo : événements + correction de dérive.
  useEffect(() => {
    const video = videoEl;
    const dub = dubAudioRef.current;
    if (!video || !dub || !dubUrl) return undefined;

    const SYNC_INTERVAL_MS = 500; // contrôle périodique
    const HARD_DRIFT_S = 0.35; // au-delà : on recale la position
    const SOFT_DRIFT_S = 0.08; // en dessous : on ajuste légèrement la vitesse

    // État sonore initial, mémorisé une fois pour toutes.
    const wasMuted = video.muted;
    const isMuteOriginal = () =>
      muteOriginalRef.current || video.dataset?.muteOriginal === "1";

    // Son du doublage : suit la préférence de l'utilisateur (hors mute_original,
    // qui ne coupe que la piste d'origine).
    const dubShouldBeMuted = () =>
      typeof userMutedRef.current === "boolean"
        ? userMutedRef.current
        : wasMuted && !isMuteOriginal();

    // La piste d'origine est coupée pour laisser entendre le doublage.
    const muteOriginalTrack = () => {
      if (!video.muted) video.muted = true;
    };

    // Rétablit exactement l'état d'avant : préférence de lecture si connue,
    // sinon valeur mémorisée. Jamais de « unmute » forcé.
    const restoreOriginalTrack = () => {
      video.muted =
        typeof userMutedRef.current === "boolean"
          ? userMutedRef.current || isMuteOriginal()
          : wasMuted;
    };

    const syncDub = (hard = false) => {
      const target = video.currentTime;
      if (!Number.isFinite(target)) return;

      // Doublage plus court que la vidéo : silence à la fin.
      if (Number.isFinite(dub.duration) && target > dub.duration) {
        if (!dub.paused) dub.pause();
        return;
      }

      const rate = video.playbackRate || 1;
      const drift = dub.currentTime - target; // > 0 : le doublage est en avance

      if (hard || Math.abs(drift) > HARD_DRIFT_S) {
        try {
          dub.currentTime = target;
        } catch {
          // métadonnées pas encore disponibles
        }
        dub.playbackRate = rate;
      } else if (Math.abs(drift) > SOFT_DRIFT_S) {
        dub.playbackRate = rate * (drift > 0 ? 0.96 : 1.04);
      } else if (dub.playbackRate !== rate) {
        dub.playbackRate = rate;
      }
    };

    const startDub = () => {
      if (video.paused || video.ended) return;
      dub.muted = dubShouldBeMuted();
      syncDub(true);
      dub.play().catch((err) => {
        if (err?.name !== "AbortError") console.debug("Dub play error:", err);
      });
    };

    const stopDub = () => dub.pause();

    const onSeeked = () => syncDub(true);
    const onRateChange = () => {
      dub.playbackRate = video.playbackRate || 1;
    };
    const onVolumeChange = () => {
      // Une autre partie de l'app a rendu le son à la vidéo : on le recoupe.
      muteOriginalTrack();
      dub.muted = dubShouldBeMuted();
    };
    const onDubMetadata = () => {
      syncDub(true);
      if (!video.paused) startDub();
    };

    // Erreur de chargement audio : un nouvel essai, puis abandon propre.
    let retried = false;
    const onDubError = () => {
      if (!dub.getAttribute("src")) return; // src retiré volontairement
      if (!retried) {
        retried = true;
        console.debug("Dub audio error, retry:", dub.error);
        dub.load();
        return;
      }
      dropDubRef.current();
    };

    muteOriginalTrack();
    dub.muted = dubShouldBeMuted();

    video.addEventListener("play", startDub);
    video.addEventListener("playing", startDub); // reprise après mise en mémoire tampon
    video.addEventListener("pause", stopDub);
    video.addEventListener("waiting", stopDub);
    video.addEventListener("ended", stopDub);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("volumechange", onVolumeChange);
    dub.addEventListener("loadedmetadata", onDubMetadata);
    dub.addEventListener("error", onDubError);

    // Contrôle périodique : dérive sur lecture longue, doublage arrêté par le
    // navigateur, son rendu à la vidéo sans événement.
    const timer = setInterval(() => {
      muteOriginalTrack();
      dub.muted = dubShouldBeMuted();
      if (video.paused || video.ended) return;
      if (dub.paused) {
        if (dub.readyState >= 2 && !dub.ended) startDub();
        return;
      }
      syncDub(false);
    }, SYNC_INTERVAL_MS);

    // Lancer immédiatement si la vidéo tourne déjà
    if (!video.paused) startDub();

    return () => {
      clearInterval(timer);
      video.removeEventListener("play", startDub);
      video.removeEventListener("playing", startDub);
      video.removeEventListener("pause", stopDub);
      video.removeEventListener("waiting", stopDub);
      video.removeEventListener("ended", stopDub);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("volumechange", onVolumeChange);
      dub.removeEventListener("loadedmetadata", onDubMetadata);
      dub.removeEventListener("error", onDubError);
      dub.pause();
      restoreOriginalTrack();
    };
  }, [dubUrl, videoEl]);


  // Couper aussi la piste musicale séparée pendant le doublage.
  const soundtrackSuppressedRef = useRef(false);

  useEffect(() => {
    const soundtrack = audioRefs?.current?.[String(audioId)];
    if (!soundtrack) return;

    if (dubUrl) {
      soundtrackSuppressedRef.current = true;
      soundtrack.pause();
      soundtrack.muted = true;
      return;
    }

    if (soundtrackSuppressedRef.current) {
      soundtrackSuppressedRef.current = false;
      soundtrack.muted = Boolean(userMuted);

      const video = videoEl;
      if (video && !video.paused && !userMuted) {
        if (Number.isFinite(soundtrack.duration) && soundtrack.duration > 0) {
          try {
            soundtrack.currentTime = video.currentTime % soundtrack.duration;
          } catch {}
        }
        soundtrack.play().catch(() => {});
      }
    }
  }, [dubUrl, userMuted, videoEl, audioRefs, audioId]);

  const clear = () => {
    setActive(null);
    const video = videoRef?.current;
    if (video) {
      // Le son est restauré par l'effet de synchronisation du doublage.
      // Seules les pistes BAARO sont retirées
      video.querySelectorAll("track[data-baaro-translate]").forEach((t) => {
        if (t.track) t.track.mode = "disabled";
        t.remove();
      });
      // Restaure les sous-titres d'origine qui étaient affichés
      hiddenTracksRef.current.forEach((t) => {
        t.mode = "showing";
      });
      hiddenTracksRef.current = [];
    }
    if (dubAudioRef.current) {
      dubAudioRef.current.pause();
      dubAudioRef.current.removeAttribute("src");
      dubAudioRef.current.load();
    }
  };

  const applyVtt = (vttUrl, vttText, lang) => {
    const video = videoRef?.current;
    if (!video) return;

    // Assurer le support CORS
    if (!video.hasAttribute("crossorigin")) {
      video.setAttribute("crossorigin", "anonymous");
    }

    // Supprimer les anciennes pistes
    video.querySelectorAll("track[data-baaro-translate]").forEach((t) => t.remove());
    if (hiddenTracksRef.current.length === 0) {
      hiddenTracksRef.current = Array.from(video.textTracks).filter(
        (t) => t.mode === "showing"
      );
    }
    hiddenTracksRef.current.forEach((t) => {
      t.mode = "disabled";
    });

    let src = vttUrl;

    // Utilisation d'un Data URI pour éviter les restrictions de sécurité Blobs/WebView sur Mobile
    if (vttText) {
      const encodedVtt = encodeURIComponent(vttText);
      src = `data:text/vtt;charset=utf-8,${encodedVtt}`;
    }

    if (!src) return;

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = `BAARO (${(lang || uiLang).toUpperCase()})`;
    track.srclang = lang || uiLang;
    track.src = src;
    track.default = true;
    track.setAttribute("data-baaro-translate", "1");

    video.appendChild(track);

    // Forcer l'activation d'affichage des sous-titres sur le lecteur vidéo
    setTimeout(() => {
      if (track.track) track.track.mode = "showing";
    }, 100);
  };

  const run = async (targetLang, chosenMode) => {
    if (!mediaUrl || loading) return;
    setLoading(true);
    setOpen(false);

    // Pré-débloquer l'élément audio pour contourner les restrictions Autoplay mobiles
    if (dubAudioRef.current && chosenMode === "dub") {
      dubAudioRef.current.play().catch(() => {});
    }

    try {
      const data = await translateMedia({
        mediaUrl,
        targetLang,
        mode: chosenMode,
        videoId,
      });

      if (!data) throw new Error("Réponse de traduction vide");

      setActive({
        targetLang: data.targetLang || targetLang,
        sourceLang: data.sourceLang,
        vttUrl: data.vttUrl,
        vttText: data.vttText,
        dubAudioUrl: data.dubAudioUrl,
        translatedText: data.translatedText,
        mode: data.mode || chosenMode,
      });

      if (chosenMode === "subtitles" || data.vttText || data.vttUrl) {
        applyVtt(data.vttUrl, data.vttText, data.targetLang || targetLang);
      }

      const lang = targetLang.toUpperCase();
      if (chosenMode === "dub" && data.dubError) {
        showToast(t("video_translate.dub_failed_subs_ok"), "error");
      } else {
        showToast(
          chosenMode === "dub"
            ? t("video_translate.dub_ready", { lang })
            : t("video_translate.subs_ready", { lang }),
          "success"
        );
      }
    } catch (err) {
      console.error("Erreur Traduction Vidéo:", err);
      showToast(err.message || t("video_translate.failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      {active && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition active:scale-95"
          style={{
            color: COLORS.teal,
            borderColor: COLORS.borderTeal,
            background: "rgba(45,191,166,0.1)",
          }}
        >
          <X size={12} />
          {t("video_translate.original")}
        </button>
      )}

      <button
        type="button"
        disabled={loading || !mediaUrl}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40"
        style={{
          color: COLORS.ivory,
          borderColor: COLORS.borderGold,
          background: COLORS.surface2,
        }}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" style={{ color: COLORS.gold }} />
        ) : (
          <Languages size={14} style={{ color: COLORS.gold }} />
        )}
        {loading ? t("video_translate.translating") : t("video_translate.translate")}
        <ChevronDown size={12} style={{ color: COLORS.muted }} />
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 z-50 w-56 rounded-xl border shadow-2xl p-2"
          style={{ background: COLORS.surface2, borderColor: COLORS.borderGold }}
        >
          <p
            className="px-2 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: COLORS.muted }}
          >
            {t("video_translate.mode")}
          </p>
          <div className="flex gap-1 mb-2 px-1">
            <button
              type="button"
              onClick={() => setMode("subtitles")}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg border transition"
              style={{
                borderColor: mode === "subtitles" ? COLORS.gold : COLORS.border,
                background:
                  mode === "subtitles" ? COLORS.goldGlow : "transparent",
                color: mode === "subtitles" ? COLORS.gold : COLORS.muted,
              }}
            >
              <Captions size={12} />
              {t("video_translate.subtitles")}
            </button>
            <button
              type="button"
              onClick={() => setMode("dub")}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg border transition"
              style={{
                borderColor: mode === "dub" ? COLORS.teal : COLORS.border,
                background: mode === "dub" ? COLORS.tealGlow : "transparent",
                color: mode === "dub" ? COLORS.teal : COLORS.muted,
              }}
            >
              <AudioLines size={12} />
              {t("video_translate.voice")}
            </button>
          </div>

          <p
            className="px-2 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: COLORS.muted }}
          >
            {t("video_translate.language")}
          </p>
          <div className="max-h-40 overflow-y-auto scrollbar-thin">
            {[...TRANSLATE_LANGS].sort((a, b) => (b.code === uiLang) - (a.code === uiLang)).map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => run(l.code, mode)}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition hover:bg-white/5"
                style={{ color: COLORS.ivory }}
              >
                {l.label}
              </button>
            ))}
          </div>
          {mode === "dub" && (
            <p className="px-2 pt-2 text-[10px] leading-relaxed" style={{ color: COLORS.muted }}>
              {t("video_translate.dub_hint")}
            </p>
          )}
        </div>
      )}

      {/* Audio de doublage caché */}
      <audio
        ref={dubAudioRef}
        src={active?.dubAudioUrl || undefined}
        preload="auto"
        playsInline
      />
    </div>
  );
}
export default VideoTranslateControls;
