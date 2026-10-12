const CACHE_NAME = "baaro-cache-v6";
const MAX_RUNTIME_ENTRIES = 80;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/sounds/baaro_pulse.mp3",
  "/sounds/live_drop.mp3",
];

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "" };
  }

  const title = String(payload.title || "BAARO").slice(0, 80);
  const body = String(payload.body || "").slice(0, 240);
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url
      : "/";

  // Son custom si fourni (chemin relatif public), sinon défaut navigateur
  const sound =
    typeof payload.sound === "string" && payload.sound.startsWith("/")
      ? payload.sound
      : undefined;

  const options = {
    body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || undefined,
    data: { url, category: payload.category || null },
    renotify: !!payload.renotify,
    silent: payload.silent === true,
  };

  // Certains navigateurs supportent `sound` (Chrome Android notamment)
  if (sound && !options.silent) {
    options.sound = sound;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing) existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isNavigation = request.mode === "navigate";
  const cacheable =
    /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|wasm|mp3|wav)$/i.test(
      url.pathname
    );

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (!cacheable) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(async (cache) => {
            await cache.put(request, clone);
            await trimCache(CACHE_NAME, MAX_RUNTIME_ENTRIES);
          }).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
