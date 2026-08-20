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
 *
 * - mode subtitles : piste <track> WebVTT + texte
 * - mode dub       : piste audio superposée (voix traduite)
 *
 * Props:
 *   mediaUrl   — URL publique de la vidéo
 *   videoId    — id stable (cache serveur)
 *   videoRef   — ref React vers l'élément <video>
 *   preferredLang
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

  // Sync dub audio avec la vidéo
  useEffect(() => {
    const video = videoRef?.current;
    const dub = dubAudioRef.current;
    if (!video || !dub || !active?.dubAudioUrl) return;

    const onPlay = () => {
      dub.currentTime = video.currentTime;
      dub.play().catch(() => {});
    };
    const onPause = () => dub.pause();
    const onSeek = () => {
      dub.currentTime = video.currentTime;
    };
    const onVolume = () => {
      // Baisser un peu la piste originale pour entendre le doublage
      video.muted = true;
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    onVolume();

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.muted = false;
    };
  }, [active?.dubAudioUrl, videoRef]);

  const clear = () => {
    setActive(null);
    const video = videoRef?.current;
    if (video) {
      video.muted = false;
      // Retirer tracks ajoutées
      const tracks = video.querySelectorAll("track[data-baaro-translate]");
      tracks.forEach((t) => t.remove());
    }
    if (dubAudioRef.current) {
      dubAudioRef.current.pause();
      dubAudioRef.current.src = "";
    }
  };

  const applyVtt = (vttUrl, vttText) => {
    const video = videoRef?.current;
    if (!video) return;

    // Nettoyer anciennes pistes
    video.querySelectorAll("track[data-baaro-translate]").forEach((t) => t.remove());

    let src = vttUrl;
    if (!src && vttText) {
      const blob = new Blob([vttText], { type: "text/vtt" });
      src = URL.createObjectURL(blob);
    }
    if (!src) return;

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = "BAARO";
    track.srclang = active?.targetLang || preferredLang;
    track.src = src;
    track.default = true;
    track.setAttribute("data-baaro-translate", "1");
    video.appendChild(track);

    // Activer
    requestAnimationFrame(() => {
      if (video.textTracks?.[0]) {
        video.textTracks[0].mode = "showing";
      }
    });
  };

  const run = async (targetLang, chosenMode) => {
    if (!mediaUrl || loading) return;
    setLoading(true);
    setOpen(false);
    try {
      const data = await translateMedia({
        mediaUrl,
        targetLang,
        mode: chosenMode,
        videoId,
      });
      setActive({
        targetLang: data.targetLang,
        sourceLang: data.sourceLang,
        vttUrl: data.vttUrl,
        vttText: data.vttText,
        dubAudioUrl: data.dubAudioUrl,
        translatedText: data.translatedText,
        mode: data.mode,
      });
      if (data.mode === "subtitles" || data.vttText || data.vttUrl) {
        // Léger délai pour que active soit posé
        setTimeout(() => applyVtt(data.vttUrl, data.vttText), 50);
      }
      showToast(
        data.mode === "dub"
          ? `Doublage ${targetLang.toUpperCase()} prêt`
          : `Sous-titres ${targetLang.toUpperCase()} prêts`,
        "success"
      );
    } catch (err) {
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
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border"
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
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg border"
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
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg border"
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
          <div className="max-h-40 overflow-y-auto">
            {TRANSLATE_LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => run(l.code, mode)}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition"
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
      <audio ref={dubAudioRef} src={active?.dubAudioUrl || undefined} preload="auto" />
    </div>
  );
}
