import { Capacitor, registerPlugin } from "@capacitor/core";

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

let castReadyPromise = null;
const NativeCast = registerPlugin("BaaroCast");

export function loadGoogleCast() {
  if (typeof window === "undefined") return Promise.resolve(false);

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return NativeCast.isAvailable()
      .then((result) => Boolean(result?.available))
      .catch(() => false);
  }

  if (window.cast?.framework && window.chrome?.cast) {
    return Promise.resolve(true);
  }

  if (castReadyPromise) return castReadyPromise;

  castReadyPromise = new Promise((resolve) => {
    let settled = false;
    let timeout;

    const finish = (available) => {
      if (settled) return;
      settled = true;
      if (timeout) window.clearTimeout(timeout);
      resolve(Boolean(available));
    };

    const previousCallback = window.__onGCastApiAvailable;

    window.__onGCastApiAvailable = (available) => {
      try {
        if (typeof previousCallback === "function") {
          previousCallback(available);
        }
      } catch {}

      finish(available && window.cast?.framework);
    };

    let script = document.querySelector(
      `script[src="${CAST_SDK_URL}"]`
    );

    if (!script) {
      script = document.createElement("script");
      script.src = CAST_SDK_URL;
      script.async = true;
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }

    timeout = window.setTimeout(() => finish(false), 12000);
  });

  return castReadyPromise;
}

export function isAirPlayAvailable(video) {
  if (!video || typeof window === "undefined") return false;

  return (
    typeof video.webkitShowPlaybackTargetPicker === "function" ||
    (
      window.WebKitPlaybackTargetAvailabilityEvent &&
      "webkitCurrentPlaybackTargetIsWireless" in video
    )
  );
}

export function openAirPlay(video) {
  if (!isAirPlayAvailable(video)) {
    throw new Error("AirPlay n'est pas disponible dans ce navigateur.");
  }

  video.disableRemotePlayback = false;
  video.setAttribute("airplay", "allow");

  if (typeof video.webkitShowPlaybackTargetPicker === "function") {
    video.webkitShowPlaybackTargetPicker();
    return true;
  }

  throw new Error("Le sélecteur AirPlay n'est pas accessible.");
}

function getMediaType(video, url) {
  const source = video.querySelector("source[type]")?.getAttribute("type");

  if (source) return source.split(";")[0].trim();

  try {
    const pathname = new URL(url, window.location.href).pathname;

    if (/\.webm$/i.test(pathname)) return "video/webm";
    if (/\.m3u8$/i.test(pathname)) return "application/x-mpegURL";
    if (/\.mpd$/i.test(pathname)) return "application/dash+xml";
  } catch {}

  return "video/mp4";
}

export function stopCastSync(video) {
  if (!video) return;

  if (video.__baaroCastSyncTimer) {
    window.clearInterval(video.__baaroCastSyncTimer);
    delete video.__baaroCastSyncTimer;
  }

  const handlers = video.__baaroCastHandlers;

  if (handlers) {
    video.removeEventListener("play", handlers.play);
    video.removeEventListener("pause", handlers.pause);
    video.removeEventListener("seeking", handlers.seeking);
    delete video.__baaroCastHandlers;
  }

  const session = video.__baaroCastSession;
  const listener = video.__baaroCastSessionListener;

  if (session && listener) {
    try {
      session.removeUpdateListener(listener);
    } catch {}
  }

  delete video.__baaroCastSession;
  delete video.__baaroCastSessionListener;
  video.__baaroSyncingFromRemote = false;
}

async function startNativeGoogleCast(video, url, keepLocal) {
  await NativeCast.showDevicePicker();

  let connected = false;
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    const state = await NativeCast.isConnected()
      .catch(() => ({ connected: false }));

    if (state?.connected) {
      connected = true;
      break;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  if (!connected) {
    throw new Error("Connexion au téléviseur annulée ou impossible.");
  }

  await NativeCast.loadMedia({
    url,
    title: "Vidéo BAARO",
    mimeType: getMediaType(video, url),
    currentTime: Math.max(0, Number(video.currentTime) || 0),
  });

  stopCastSync(video);

  if (!keepLocal) {
    video.pause();
    return { mode: "tv", native: true };
  }

  const playLocal = () => {
    if (!video.__baaroSyncingFromRemote) {
      NativeCast.play().catch(() => {});
    }
  };

  const pauseLocal = () => {
    if (!video.__baaroSyncingFromRemote) {
      NativeCast.pause().catch(() => {});
    }
  };

  const seekLocal = () => {
    if (!video.__baaroSyncingFromRemote) {
      NativeCast.seek({
        currentTime: Math.max(0, video.currentTime),
      }).catch(() => {});
    }
  };

  video.addEventListener("play", playLocal);
  video.addEventListener("pause", pauseLocal);
  video.addEventListener("seeking", seekLocal);

  video.__baaroCastHandlers = {
    play: playLocal,
    pause: pauseLocal,
    seeking: seekLocal,
  };

  let syncing = false;

  video.__baaroCastSyncTimer = window.setInterval(async () => {
    if (syncing) return;
    syncing = true;

    try {
      const status = await NativeCast.getStatus();
      if (!status?.isLoaded) return;

      video.__baaroSyncingFromRemote = true;

      if (
        Number.isFinite(Number(status.currentTime)) &&
        Math.abs(video.currentTime - Number(status.currentTime)) > 1.8
      ) {
        video.currentTime = Number(status.currentTime);
      }

      if (status.isPaused && !video.paused) {
        video.pause();
      } else if (!status.isPaused && video.paused) {
        video.play().catch(() => {});
      }
    } catch {
    } finally {
      video.__baaroSyncingFromRemote = false;
      syncing = false;
    }
  }, 1200);

  return { mode: "both", native: true };
}

export async function startGoogleCast(video, keepLocal = false) {
  if (!video) throw new Error("Vidéo introuvable.");

  const url = video.currentSrc || video.src;

  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(
      "Cette vidéo ne possède pas d'adresse publique compatible Chromecast."
    );
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return startNativeGoogleCast(video, url, keepLocal);
  }

  const available = await loadGoogleCast();

  if (!available) {
    throw new Error(
      "Google Cast n'est pas disponible. Attends le chargement du module puis réessaie."
    );
  }

  const cast = window.cast;
  const chromeCast = window.chrome.cast;
  const context = cast.framework.CastContext.getInstance();

  context.setOptions({
    receiverApplicationId:
      chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  await context.requestSession();

  const session = context.getCurrentSession();

  if (!session) {
    throw new Error("Aucune session Chromecast active.");
  }

  stopCastSync(video);

  const mediaInfo = new chromeCast.media.MediaInfo(
    url,
    getMediaType(video, url)
  );

  mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
  mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata();
  mediaInfo.metadata.title = "Vidéo BAARO";

  const request = new chromeCast.media.LoadRequest(mediaInfo);
  request.currentTime = Math.max(0, Number(video.currentTime) || 0);
  request.autoplay = true;

  await session.loadMedia(request);

  if (!keepLocal) {
    video.pause();
    return { session, mode: "tv" };
  }

  const remotePlayer = new cast.framework.RemotePlayer();
  const controller =
    new cast.framework.RemotePlayerController(remotePlayer);

  const syncFromRemote = () => {
    if (!remotePlayer.isMediaLoaded) return;

    video.__baaroSyncingFromRemote = true;

    try {
      const remoteTime = Number(remotePlayer.currentTime);

      if (
        Number.isFinite(remoteTime) &&
        Math.abs(video.currentTime - remoteTime) > 1.8
      ) {
        video.currentTime = remoteTime;
      }

      if (remotePlayer.isPaused && !video.paused) {
        video.pause();
      } else if (!remotePlayer.isPaused && video.paused) {
        video.play().catch(() => {});
      }
    } catch {
    } finally {
      video.__baaroSyncingFromRemote = false;
    }
  };

  const playLocal = () => {
    if (video.__baaroSyncingFromRemote) return;

    if (remotePlayer.isPaused) {
      try {
        controller.playOrPause();
      } catch {}
    }
  };

  const pauseLocal = () => {
    if (video.__baaroSyncingFromRemote) return;

    if (!remotePlayer.isPaused) {
      try {
        controller.playOrPause();
      } catch {}
    }
  };

  const seekLocal = () => {
    if (video.__baaroSyncingFromRemote) return;

    try {
      remotePlayer.currentTime = Math.max(0, video.currentTime);
      controller.seek();
    } catch {}
  };

  video.addEventListener("play", playLocal);
  video.addEventListener("pause", pauseLocal);
  video.addEventListener("seeking", seekLocal);

  video.__baaroCastHandlers = {
    play: playLocal,
    pause: pauseLocal,
    seeking: seekLocal,
  };

  video.__baaroCastSession = session;

  const sessionListener = (alive) => {
    if (!alive) stopCastSync(video);
  };

  video.__baaroCastSessionListener = sessionListener;

  try {
    session.addUpdateListener(sessionListener);
  } catch {}

  video.__baaroCastSyncTimer = window.setInterval(
    syncFromRemote,
    1000
  );

  return {
    session,
    controller,
    mode: "both",
  };
}


export async function disconnectGoogleCast(videoEl) {
  stopCastSync(videoEl);

  if (Capacitor.isNativePlatform()) {
    try {
      await NativeCast.disconnect();
      return true;
    } catch (error) {
      console.warn("[BAARO Cast] Déconnexion native :", error);
      return false;
    }
  }

  try {
    const context = window.cast?.framework?.CastContext?.getInstance();
    if (context) {
      await context.endCurrentSession(true);
      return true;
    }
  } catch (error) {
    console.warn("[BAARO Cast] Déconnexion Web :", error);
  }

  return false;
}
