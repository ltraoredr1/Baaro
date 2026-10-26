import { useState, useEffect, useRef } from "react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { feedImageUrl, avatarUrl, fullImageUrl } from "../lib/mediaUrl.js";

const FALLBACK = {
  surface2: "rgba(255,255,255,0.06)",
  muted: "rgba(245,243,239,0.5)",
};

// Calculé une seule fois (et non à chaque rendu de chaque composant)
const C = { ...FALLBACK, ...(THEME_COLORS || {}) };

function resolveImageSource(src, variant, width) {
  if (!src || variant === "raw") return src || "";
  if (variant === "avatar") return avatarUrl(src, width || 96);
  if (variant === "full") return fullImageUrl(src);
  return feedImageUrl(src);
}

/** Bloc affiché quand un média est absent ou en erreur (partagé image / vidéo). */
function MediaPlaceholder({ className = "", style, children, ...rest }) {
  return (
    <div
      className={`flex items-center justify-center text-xs ${className}`}
      style={{ color: C.muted, background: C.surface2, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

function LazyImageInner({
  resolved,
  alt,
  className,
  style,
  aspectRatio,
  onClick,
  fit,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <MediaPlaceholder
        className={className}
        style={{
          aspectRatio: aspectRatio || undefined,
          minHeight: aspectRatio ? undefined : 120,
          ...style,
        }}
        role="img"
        aria-label={alt || "Média indisponible"}
      >
        Image indisponible
      </MediaPlaceholder>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-black/20 lazy-media-box ${className}`}
      style={{
        aspectRatio: aspectRatio || undefined,
        minHeight: fit === "contain" && !loaded ? 220 : undefined,
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
        src={resolved}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={fit === "contain" ? { maxHeight: "80vh" } : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full ${
          fit === "contain" ? "h-auto object-contain" : "h-full object-cover"
        } transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/**
 * Image à chargement différé.
 * Le sous-composant est recréé (key) à chaque nouvelle URL : l'état
 * « chargée / en erreur » repart donc de zéro sans effet de réinitialisation.
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
  const resolved = resolveImageSource(src, variant, width);

  if (!resolved) {
    return (
      <MediaPlaceholder
        className={`bg-black/40 ${className}`}
        style={{
          aspectRatio: aspectRatio || undefined,
          minHeight: aspectRatio ? undefined : 120,
          ...style,
        }}
        role="img"
        aria-label={alt || "Média indisponible"}
      />
    );
  }

  return (
    <LazyImageInner
      key={resolved}
      resolved={resolved}
      alt={alt}
      className={className}
      style={style}
      aspectRatio={aspectRatio}
      onClick={onClick}
      fit={fit}
    />
  );
}

function LazyVideoInner({
  src,
  fit,
  className,
  poster,
  muted,
  controls,
  autoPlayWhenVisible,
  onError,
  ...rest
}) {
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const [hasEnteredView, setHasEnteredView] = useState(false);

  const videoRef = useRef(null);
  const boxRef = useRef(null);

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
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;

        setInView(visible);
        if (visible) setHasEnteredView(true);

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
      { threshold: [0, 0.35, 0.7] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlayWhenVisible]);

  // Nettoyage du lecteur lors du démontage (y compris au changement d'URL).
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

  if (failed) {
    return (
      <MediaPlaceholder
        className={`bg-black ${className}`}
        style={{ minHeight: 160 }}
        role="status"
      >
        Vidéo indisponible
      </MediaPlaceholder>
    );
  }

  return (
    <div ref={boxRef} className={`lazy-media-box ${className}`}>
      <video
        {...rest}
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
        onError={(event) => {
          onError?.(event); // le onError du parent est conservé, il ne remplace plus le nôtre
          setFailed(true);
        }}
      />
    </div>
  );
}

/**
 * Vidéo à chargement différé : la source n'est chargée qu'à l'entrée dans le
 * viewport, puis la vidéo est mise en pause à la sortie.
 * Recréée (key) à chaque nouvelle URL : erreur et visibilité repartent de zéro.
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
  if (!src) {
    return (
      <MediaPlaceholder
        className={`bg-black ${className}`}
        style={{ minHeight: 160 }}
        role="status"
      >
        Vidéo indisponible
      </MediaPlaceholder>
    );
  }

  return (
    <LazyVideoInner
      key={src}
      src={src}
      fit={fit}
      className={className}
      poster={poster}
      muted={muted}
      controls={controls}
      autoPlayWhenVisible={autoPlayWhenVisible}
      {...rest}
    />
  );
}
