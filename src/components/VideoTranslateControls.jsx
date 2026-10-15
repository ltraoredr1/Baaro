import { useState, useRef, useEffect } from "react";
import {
  Languages,
  Loader2,
  Captions,
  AudioLines,
  ChevronDown,
  X,
} from "lucide-react";
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
  preferredLang = "en",
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("subtitles"); // subtitles | dub
  const [active, setActive] = useState(null); // { targetLang, vttUrl, dubAudioUrl, ... }
  const menuRef = useRef(null);
  const dubAudioRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Synchronisation stricte du doublage audio avec l'élément vidéo
  useEffect(() => {
    const video = videoRef?.current;
    const dub = dubAudioRef.current;
    if (!video || !dub || !active?.dubAudioUrl) return;

    // S'assurer que la vidéo principale est en sourdine pour entendre le doublage
    video.muted = true;

    const onPlay = () => {
      dub.currentTime = video.currentTime;
      dub.play().catch((err) => console.debug("Dub play error:", err));
    };
    const onPause = () => dub.pause();
    const onSeek = () => {
      dub.currentTime = video.currentTime;
    };
    const onRateChange = () => {
      dub.playbackRate = video.playbackRate;
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("ratechange", onRateChange);

    // Lancer immédiatement si la vidéo tourne déjà
    if (!video.paused) {
      onPlay();
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("ratechange", onRateChange);
      video.muted = false;
    };
  }, [active?.dubAudioUrl, videoRef]);

  const clear = () => {
    setActive(null);
    const video = videoRef?.current;
    if (video) {
      video.muted = false;
      // Nettoyage complet des pistes de sous-titres
      const tracks = video.querySelectorAll("track[data-baaro-translate]");
      tracks.forEach((t) => t.remove());

      if (video.textTracks) {
        Array.from(video.textTracks).forEach((track) => {
          track.mode = "disabled";
        });
      }
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

    let src = vttUrl;

    // Utilisation d'un Data URI pour éviter les restrictions de sécurité Blobs/WebView sur Mobile
    if (vttText) {
      const encodedVtt = encodeURIComponent(vttText);
      src = `data:text/vtt;charset=utf-8,${encodedVtt}`;
    }

    if (!src) return;

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = `BAARO (${(lang || preferredLang).toUpperCase()})`;
    track.srclang = lang || preferredLang;
    track.src = src;
    track.default = true;
    track.setAttribute("data-baaro-translate", "1");

    video.appendChild(track);

    // Forcer l'activation d'affichage des sous-titres sur le lecteur vidéo
    setTimeout(() => {
      if (video.textTracks && video.textTracks.length > 0) {
        Array.from(video.textTracks).forEach((t) => {
          if (t.label.includes("BAARO")) {
            t.mode = "showing";
          } else {
            t.mode = "disabled";
          }
        });
      }
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

      showToast(
        chosenMode === "dub"
          ? `Doublage ${targetLang.toUpperCase()} prêt`
          : `Sous-titres ${targetLang.toUpperCase()} prêts`,
        "success"
      );
    } catch (err) {
      console.error("Erreur Traduction Vidéo:", err);
      showToast(err.message || "Traduction vidéo impossible", "error");
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
          Original
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
        {loading ? "Traduction…" : "Traduire"}
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
            Mode
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
              Sous-titres
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
              Voix
            </button>
          </div>

          <p
            className="px-2 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: COLORS.muted }}
          >
            Langue
          </p>
          <div className="max-h-40 overflow-y-auto scrollbar-thin">
            {TRANSLATE_LANGS.map((l) => (
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
              Le doublage vocal utilise Whisper + TTS (peut prendre 20–60 s).
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
