const CACHE_NAME = "baaro-cache-v7";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/sounds/baaro_pulse.mp3",
  "/sounds/live_drop.mp3",
];

const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Un fichier manquant ne doit pas empêcher tout le cache
      // de l'application de s'installer.
      await Promise.allSettled(
        APP_SHELL.map((path) =>
          cache.add(new Request(path, { cache: "reload" }))
        )
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("baaro-cache-") &&
              name !== CACHE_NAME
          )
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

function getSafeSameOriginUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "/";
  }

  try {
    const url = new URL(value, self.location.origin);

    if (url.origin !== self.location.origin) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function readPushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const payload = await readPushPayload(event);
      const data =
        payload.data && typeof payload.data === "object"
          ? payload.data
          : {};

      const title =
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title.trim().slice(0, 120)
          : "BAARO";

      const body =
        typeof payload.body === "string"
          ? payload.body.slice(0, 500)
          : typeof data.body === "string"
            ? data.body.slice(0, 500)
            : "Vous avez une nouvelle notification.";

      const targetUrl = getSafeSameOriginUrl(
        payload.url || data.url || data.path
      );

      const options = {
        body,
        icon: DEFAULT_ICON,
        badge: DEFAULT_BADGE,
        data: {
          url: targetUrl,
          channel_id: data.channel_id || payload.channel_id || null,
        },
        tag:
          typeof payload.tag === "string"
            ? payload.tag.slice(0, 100)
            : "baaro-notification",
      };

      // L'option "sound" n'est pas standard pour les notifications Web.
      // Le navigateur et le système déterminent le son de notification.
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl = getSafeSameOriginUrl(
        event.notification.data?.url
      );

      const absoluteTarget = new URL(
        targetUrl,
        self.location.origin
      ).href;

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin !== self.location.origin) {
            continue;
          }

          if (typeof client.navigate === "function") {
            await client.navigate(absoluteTarget);
          }

          await client.focus();
          return;
        } catch {
          // Essaie une autre fenêtre ou ouvre une nouvelle fenêtre.
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteTarget);
      }
    })()
  );
});

self.addEventListener("notificationclose", () => {
  // Emplacement réservé au suivi facultatif des notifications fermées.
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) return;

  // Les navigations tentent le réseau d'abord, puis le cache de l'app.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cachedPage = await caches.match("/index.html");
          return (
            cachedPage ||
            new Response("Hors ligne", {
              status: 503,
              statusText: "Service Unavailable",
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
              },
            })
          );
        }
      })()
    );

    return;
  }

  // Pour les ressources locales : cache d'abord, réseau ensuite.
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);

      if (cachedResponse) return cachedResponse;

      try {
        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put(request, response.clone()));
        }

        return response;
      } catch {
        return new Response("", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
    })()
  );
});
