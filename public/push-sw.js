/**
 * BAARO — Gestionnaires de notifications Web Push.
 *
 * Ce fichier est chargé par le service worker généré par vite-plugin-pwa
 * (/sw.js) via workbox.importScripts. Il ne gère PAS le cache : le cache
 * est assuré par Workbox. Ne pas enregistrer ce fichier directement.
 */

const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";
/** Son par défaut (fichier dans public/sounds/) */
const DEFAULT_SOUND = "/sounds/baaro_pulse.mp3";

function getSafeSameOriginUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "/";

  try {
    const url = new URL(value, self.location.origin);

    if (url.origin !== self.location.origin) return "/";

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function readPushPayload(event) {
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

/**
 * Résout le chemin du son.
 * - payload.sound / data.sound : chemin absolu ou nom de fichier
 * - silent: true → pas de son
 * - sinon DEFAULT_SOUND
 */
function resolveSound(payload, data) {
  if (payload.silent === true || data.silent === true) return undefined;

  const raw =
    (typeof payload.sound === "string" && payload.sound.trim()) ||
    (typeof data.sound === "string" && data.sound.trim()) ||
    "";

  if (!raw) return DEFAULT_SOUND;
  if (raw === "default" || raw === "true") return DEFAULT_SOUND;
  if (raw === "none" || raw === "false" || raw === "silent") return undefined;

  // Chemin déjà absolu
  if (raw.startsWith("/")) return raw;
  // Nom seul → dossier sounds
  return `/sounds/${raw.replace(/^sounds\//, "")}`;
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const payload = readPushPayload(event);

      const data =
        payload.data && typeof payload.data === "object" ? payload.data : {};

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

      const sound = resolveSound(payload, data);

      const options = {
        body,
        icon: payload.icon || DEFAULT_ICON,
        badge: payload.badge || DEFAULT_BADGE,
        data: {
          url: getSafeSameOriginUrl(payload.url || data.url || data.path),
        },
        tag:
          typeof payload.tag === "string" && payload.tag
            ? payload.tag.slice(0, 100)
            : "baaro-notification",
        renotify: true,
        silent: !sound,
      };

      if (sound) {
        options.sound = sound;
      }

      // 1. Envoyer l'ordre de jouer le son aux fenêtres ouvertes de BAARO
      if (sound) {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        for (const client of windowClients) {
          client.postMessage({
            type: "PLAY_SOUND",
            sound,
          });
        }
      }

      // 2. Afficher la notification visuelle
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl = getSafeSameOriginUrl(event.notification.data?.url);
      const absoluteTarget = new URL(targetUrl, self.location.origin).href;

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin !== self.location.origin) continue;

          if (typeof client.navigate === "function") {
            await client.navigate(absoluteTarget);
          }

          await client.focus();
          return;
        } catch {
          // Essaie une autre fenêtre, sinon ouvre une nouvelle fenêtre.
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteTarget);
      }
    })()
  );
});
