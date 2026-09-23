import { useState } from "react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { feedImageUrl, avatarUrl, fullImageUrl } from "../lib/mediaUrl.js";

const FALLBACK = {
  surface2: "rgba(255,255,255,0.06)",
  muted: "rgba(245,243,239,0.5)",
};

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
  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  let resolved = src;
  if (src && variant!== "raw") {
    if (variant === "avatar") resolved = avatarUrl(src, width || 96);
    else if (variant === "full") resolved = fullImageUrl(src);
    else resolved = feedImageUrl(src);
  }

  if (!resolved || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/40 text-xs ${className}`}
        style={{
          color: C.muted,
          aspectRatio: aspectRatio || undefined,
          minHeight: aspectRatio? undefined : 120,
          background: C.surface2,
         ...style,
        }}
        role="img"
        aria-label={alt || "Média indisponible"}
      >
        {failed? "Image indisponible" : ""}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-black/20 ${className}`}
      style={{ aspectRatio: aspectRatio || undefined,...style }}
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
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded? "opacity-100" : "opacity-0"
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
  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black text-xs ${className}`}
        style={{ color: C.muted, minHeight: 160, background: C.surface2 }}
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
