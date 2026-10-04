import { useState, useEffect, useRef } from "react";
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
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
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
      style={{ aspectRatio: aspectRatio || undefined, ...style }}
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
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/** Vidéo lazy + pause hors viewport (moins de conso). */
export function LazyVideo({
  src,
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
  const videoRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        const visible =
          entry.isIntersecting && entry.intersectionRatio >= 0.35;
        setInView(visible);
        const v = videoRef.current;
        if (!v) return;
        if (!visible) {
          try {
            v.pause();
          } catch {}
        } else if (autoPlayWhenVisible) {
          v.muted = true;
          v.play().catch(() => {});
        }
      },
      { threshold: [0, 0.35, 0.7] }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlayWhenVisible]);

  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
          v.removeAttribute("src");
          v.load();
        } catch {}
      }
    };
  }, []);

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
    <div ref={boxRef} className={`lazy-media-box ${className}`}>
      <video
        ref={videoRef}
        src={inView ? src : undefined}
        poster={poster}
        className="w-full h-full object-cover"
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
