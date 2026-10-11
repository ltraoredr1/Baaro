/**
 * BAARO service-worker — cache + push (messages + appels entrants)
 * Quand type === "incoming_call" : notification persistante + vibration + actions
 */
const CACHE_NAME = "baaro-cache-v6";
const MAX_RUNTIME_ENTRIES = 80;
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
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

  const isCall = payload.type === "incoming_call";
  const title = String(payload.title || (isCall ? "Appel BAARO" : "BAARO")).slice(0, 80);
  const body = String(payload.body || "").slice(0, 240);
  const url =
    typeof payload.url === "string" && (payload.url.startsWith("/") || payload.url.startsWith("?"))
      ? payload.url.startsWith("?")
        ? `/${payload.url}`
        : payload.url
      : isCall
        ? `/?open=call&call_id=${encodeURIComponent(payload.call_id || "")}`
        : "/";

  const options = {
    body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || (isCall ? `baaro-call-${payload.call_id || "x"}` : undefined),
    data: {
      url,
      type: payload.type || "message",
      call_id: payload.call_id,
      call_type: payload.call_type,
      caller_id: payload.caller_id,
      caller_name: payload.caller_name,
      daily_room_name: payload.daily_room_name,
    },
    renotify: isCall ? true : Boolean(payload.renotify),
    requireInteraction: isCall || Boolean(payload.requireInteraction),
    silent: false,
  };

  if (isCall) {
    options.vibrate = payload.vibrate || [400, 200, 400, 200, 400, 1200];
    // Actions (supportées Chrome / Android)
    options.actions = payload.actions || [
      { action: "accept", title: "Répondre" },
      { action: "reject", title: "Refuser" },
    ];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification?.data || {};
  const action = event.action; // "accept" | "reject" | ""
  event.notification.close();

  let target = data.url || "/";
  if (data.type === "incoming_call") {
    if (action === "reject") {
      target = `/?open=call&action=reject&call_id=${encodeURIComponent(data.call_id || "")}`;
    } else {
      // accept ou clic simple → ouvrir l'appel
      target = `/?open=call&action=accept&call_id=${encodeURIComponent(data.call_id || "")}&call_type=${encodeURIComponent(data.call_type || "voice")}`;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing) {
          try {
            existing.navigate(target);
          } catch (_) {}
        }
        // Notifier la page ouverte
        try {
          existing.postMessage({
            type: "baaro:incoming_call",
            action: action || "accept",
            call_id: data.call_id,
            call_type: data.call_type,
            caller_id: data.caller_id,
            caller_name: data.caller_name,
            daily_room_name: data.daily_room_name,
          });
        } catch (_) {}
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});

self.addEventListener("notificationclose", (event) => {
  // Optionnel : si l'utilisateur ferme sans répondre, on pourrait marquer missed côté client
  const data = event.notification?.data || {};
  if (data.type === "incoming_call") {
    // no-op serveur ici (pas d'auth dans le SW)
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isNavigation = request.mode === "navigate";
  const cacheable = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|wasm)$/i.test(url.pathname);

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
          caches
            .open(CACHE_NAME)
            .then(async (cache) => {
              await cache.put(request, clone);
              await trimCache(CACHE_NAME, MAX_RUNTIME_ENTRIES);
            })
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
