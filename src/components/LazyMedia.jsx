
import { useState, useEffect, useRef } from "react";
import { COLORS as THEME_COLORS } from "../theme.js";
import {
  feedImageUrl,
  avatarUrl,
  fullImageUrl,
} from "../lib/mediaUrl.js";

const FALLBACK = {
  surface2: "rgba(255,255,255,0.06)",
  muted: "rgba(245,243,239,0.5)",
};

function resolveImageSource(src, variant, width) {
  if (!src || variant === "raw") return src || "";

  if (variant === "avatar") {
    return avatarUrl(src, width || 96);
  }

  if (variant === "full") {
    return fullImageUrl(src);
  }

  return feedImageUrl(src);
}

/**
 * Image à chargement différé.
 * Conserve les fonctions existantes de résolution des URL.
 */
export function LazyImage({
  src,
  alt = "",
  className = "",
  style,
  aspectRatio,
  onClick,
  variant = "feed",
  width,
  fit = "cover",
}) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const resolved = resolveImageSource(src, variant, width);

  // Réinitialise l'état lorsqu'une nouvelle image est demandée.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/40 text-xs ${className}`}
        style={{
          color: C.muted,
          aspectRatio: aspectRatio || undefined,
          minHeight: aspectRatio ? undefined : 120,
          background: C.surface2,
          ...style,
        }}
        role="img"
        aria-label={alt || "Média indisponible"}
      >
        {failed ? "Image indisponible" : ""}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-black/20 lazy-media-box ${className}`}
      style={{
        aspectRatio: aspectRatio || undefined,
        minHeight:
          fit === "contain" && !loaded ? 220 : undefined,
        ...style,
      }}
      onClick={onClick}
    >
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: C.surface2 }}
          aria-hidden="true"
        />
      )}

      <img
        key={resolved}
        src={resolved}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={
          fit === "contain"
            ? { maxHeight: "80vh" }
            : undefined
        }
        onLoad={() => {
          setLoaded(true);
          setFailed(false);
        }}
        onError={() => {
          setLoaded(false);
          setFailed(true);
        }}
        className={`w-full ${
          fit === "contain"
            ? "h-auto object-contain"
            : "h-full object-cover"
        } transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * Vidéo à chargement différé.
 * La vidéo est chargée lorsqu'elle entre dans le viewport,
 * puis mise en pause lorsqu'elle en sort.
 */
export function LazyVideo({
  src,
  fit = "cover",
  className = "",
  poster,
  muted = true,
  controls = true,
  autoPlayWhenVisible = false,
  ...rest
}) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };

  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const [hasEnteredView, setHasEnteredView] = useState(false);

  const videoRef = useRef(null);
  const boxRef = useRef(null);

  // Une nouvelle URL ne doit pas conserver l'erreur précédente.
  useEffect(() => {
    setFailed(false);
    setHasEnteredView(false);
  }, [src]);

  useEffect(() => {
    const el = boxRef.current;

    if (!el) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      setHasEnteredView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible =
          entry.isIntersecting &&
          entry.intersectionRatio >= 0.35;

        setInView(visible);

        if (visible) {
          setHasEnteredView(true);
        }

        const video = videoRef.current;

        if (!video) return;

        if (!visible) {
          try {
            video.pause();
          } catch {
            // Certains navigateurs peuvent refuser cette opération.
          }

          return;
        }

        if (autoPlayWhenVisible) {
          video.muted = true;

          video.play().catch(() => {
            // La lecture automatique peut être bloquée par le navigateur.
          });
        }
      },
      {
        threshold: [0, 0.35, 0.7],
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [src, autoPlayWhenVisible]);

  // Nettoyage du lecteur lors du démontage du composant.
  useEffect(() => {
    return () => {
      const video = videoRef.current;

      if (!video) return;

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Le nettoyage ne doit pas interrompre le démontage.
      }
    };
  }, []);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black text-xs ${className}`}
        style={{
          color: C.muted,
          minHeight: 160,
          background: C.surface2,
        }}
        role="status"
      >
        Vidéo indisponible
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className={`lazy-media-box ${className}`}
    >
      <video
        key={src}
        ref={videoRef}
        src={hasEnteredView ? src : undefined}
        poster={poster}
        className={
          fit === "contain"
            ? "w-full h-auto max-h-[80vh] object-contain bg-black"
            : "w-full h-full object-cover"
        }
        controls={controls}
        muted={muted}
        playsInline
        preload={inView ? "metadata" : "none"}
        onError={() => setFailed(true)}
        {...rest}
      />
    </div>
  );
}
