/**
 * BAARO — Gestionnaires de notifications Web Push.
 *
 * Ce fichier est chargé par le service worker généré par vite-plugin-pwa
 * (/sw.js) via workbox.importScripts. Il ne gère PAS le cache : le cache
 * est assuré par Workbox. Ne pas enregistrer ce fichier directement.
 */

const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";
/**
 * COMPORTEMENT DU SON (Web Push)
 * ─────────────────────────────────────────────────────────────────────────
 * Le navigateur ne permet PAS de jouer un fichier audio personnalisé depuis
 * une notification : l'option `sound` de showNotification() n'est pas
 * standard et est ignorée. Un service worker ne peut pas non plus jouer de
 * son lui-même, et un message envoyé à une page suspendue n'est pas garanti.
 * On distingue donc quatre situations :
 *
 *  1. App ouverte et visible  → l'app joue le son choisi (son, volume,
 *     silencieux de BAARO). La notification système est affichée SANS son,
 *     pour ne pas doubler.
 *  2. App en arrière-plan, suspendue ou fermée → seul le son système par
 *     défaut de la notification est possible (pas de son BAARO personnalisé,
 *     pas de volume BAARO). Aucun message n'est envoyé à la page : elle
 *     pourrait se réveiller plus tard et jouer un son périmé.
 *  3. Mode silencieux BAARO (payload.silent / sound "none") → notification
 *     muette, aucun son nulle part.
 *  4. Téléphone en mode silencieux / Ne pas déranger → c'est l'OS qui
 *     décide ; BAARO ne le contourne jamais.
 */

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
 * Vrai si la notification doit faire du bruit (sous une forme ou une autre).
 * Faux si le serveur a demandé le silence (préférence « silencieux » de
 * l'utilisateur) : payload.silent, ou sound "none" / "false" / "silent".
 * Le chemin du son envoyé par le serveur n'est pas lu : l'app utilise son
 * propre réglage.
 */
function wantsSound(payload, data) {
  if (payload.silent === true || data.silent === true) return false;

  const raw = (
    (typeof payload.sound === "string" && payload.sound.trim()) ||
    (typeof data.sound === "string" && data.sound.trim()) ||
    ""
  ).toLowerCase();

  return !(raw === "none" || raw === "false" || raw === "silent");
}

/**
 * Qui fait le bruit ?
 * - "none"   : silence demandé.
 * - "app"    : une fenêtre BAARO est visible, l'app joue le son choisi.
 * - "system" : app en arrière-plan ou fermée, son système par défaut.
 */
function pickSoundMode(windowClients, soundWanted) {
  if (!soundWanted) return "none";

  const appIsVisible = (windowClients || []).some(
    (client) => client && client.visibilityState === "visible"
  );

  return appIsVisible ? "app" : "system";
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

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const mode = pickSoundMode(windowClients, wantsSound(payload, data));

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
        // Seul le mode "system" laisse l'OS faire son bruit. En mode "app"
        // c'est l'app qui joue ; en mode "none" tout est muet.
        // (Pas d'option `sound` : non standard, ignorée par les navigateurs.)
        silent: mode !== "system",
      };

      // 1. App visible : lui demander de jouer le son choisi. `sentAt` permet
      //    à la page d'ignorer un message tardif (page réveillée après coup).
      if (mode === "app") {
        for (const client of windowClients) {
          if (client.visibilityState !== "visible") continue;

          client.postMessage({
            type: "PLAY_SOUND",
            sentAt: Date.now(),
          });
        }
      }

      // 2. Afficher la notification système
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
