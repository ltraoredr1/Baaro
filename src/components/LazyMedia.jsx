/**
 * Image / vidéo optimisées : lazy, decode async, placeholder, erreur soft.
 */
import { useState } from "react";
import { COLORS } from "../theme.js";

export function LazyImage({
  src,
  alt = "",
  className = "",
  style,
  aspectRatio,
  onClick,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
        src={src}
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
