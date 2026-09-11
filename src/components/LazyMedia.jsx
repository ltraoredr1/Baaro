/**
 * Image / vidéo optimisées + miniatures Supabase.
 * Place : src/components/LazyMedia.jsx
 * (remplace l'ancien fichier du même nom)
 */
import { useState } from "react";
import { COLORS } from "../theme.js";
import { feedImageUrl, avatarUrl, fullImageUrl } from "../lib/mediaUrl.js";

/**
 * @param {object} props
 * @param {'feed'|'avatar'|'full'|'raw'} [props.variant]
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
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  let resolved = src;
  if (src && variant !== "raw") {
    if (variant === "avatar") resolved = avatarUrl(src, width || 96);
    else if (variant === "full") resolved = fullImageUrl(src);
    else resolved = feedImageUrl(src);
  }

  if (!resolved || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/40 text-xs ${className}`}
        style={{
          color: COLORS.muted,
          aspectRatio: aspectRatio || undefined,
          minHeight: aspectRatio ? undefined : 120,
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
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: aspectRatio || undefined, ...style }}
      onClick={onClick}
    >
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: COLORS.surface2 }}
          aria-hidden
        />
      )}
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export function LazyVideo({
  src,
  className = "",
  poster,
  muted = true,
  controls = true,
  ...rest
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black text-xs ${className}`}
        style={{ color: COLORS.muted, minHeight: 160 }}
      >
        Vidéo indisponible
      </div>
    );
  }

  return (
    <video
      src={src}
      poster={poster}
      className={className}
      controls={controls}
      muted={muted}
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
