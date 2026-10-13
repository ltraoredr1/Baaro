
import { Capacitor } from "@capacitor/core";

const SERVICE_NAME = "com.baaro.app.nearby";

let isInitialized = false;
let isStarting = false;
let isStopping = false;

const connectedEndpoints = new Set();

function getPlugins() {
  try {
    return Capacitor.Plugins || {};
  } catch {
    return {};
  }
}

function getPlugin() {
  const plugins = getPlugins();
  return plugins.NearbyChat || plugins.NearbyConnections || null;
}

function getPluginName() {
  const plugins = getPlugins();

  if (plugins.NearbyChat) return "NearbyChat";
  if (plugins.NearbyConnections) return "NearbyConnections";

  return null;
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Une erreur inattendue est survenue avec Nearby.";
}

function normalizePermission(value) {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();

    if (
      [
        "granted",
        "denied",
        "prompt",
        "prompt-with-rationale",
        "limited",
      ].includes(normalized)
    ) {
      return normalized;
    }

    return "unknown";
  }

  if (typeof value === "boolean") {
    return value ? "granted" : "denied";
  }

  if (value && typeof value === "object") {
    if (typeof value.granted === "boolean") {
      return value.granted ? "granted" : "denied";
    }

    if (typeof value.state === "string") {
      return normalizePermission(value.state);
    }
  }

  return "unknown";
}

function normalizePermissions(status) {
  if (!status || typeof status !== "object") {
    return { nearby: "unknown", location: "unknown" };
  }

  return {
    nearby: normalizePermission(
      status.nearby ?? status.bluetooth ?? status.bluetoothScan
    ),
    location: normalizePermission(
      status.location ?? status.locationPermission
    ),
    raw: status,
  };
}

function requirePlugin() {
  const plugin = getPlugin();

  if (!plugin) {
    throw new Error(
      "Plugin Nearby indisponible. Vérifie son enregistrement Android, puis exécute npx cap sync android et reconstruis l’application."
    );
  }

  return plugin;
}

function requireEndpointId(endpointId) {
  if (typeof endpointId !== "string" || !endpointId.trim()) {
    throw new Error("Identifiant de connexion Nearby invalide.");
  }

  return endpointId.trim();
}

function assertAndroid() {
  if (
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== "android"
  ) {
    throw new Error(
      "Le mode Nearby est disponible uniquement dans l’application Android native."
    );
  }
}

function assertPermissionsGranted(permissions) {
  if (
    permissions?.nearby !== "granted" ||
    permissions?.location !== "granted"
  ) {
    throw new Error(
      "Les permissions Nearby nécessaires ne sont pas confirmées. Vérifie les autorisations Bluetooth et localisation dans les paramètres de l’application."
    );
  }
}

export function isNearbyAvailable() {
  try {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android" &&
      !!getPlugin()
    );
  } catch {
    return false;
  }
}

export function getNearbyDebug() {
  let isNative = false;
  let platform = "unknown";

  try {
    isNative = Capacitor.isNativePlatform();
    platform = Capacitor.getPlatform();
  } catch {
    // Diagnostic disponible même si Capacitor ne répond pas.
  }

  return {
    isNative,
    isPluginAvailable: !!getPlugin(),
    platform,
    hasPlugin: !!getPlugin(),
    isInitialized,
    isStarting,
    isStopping,
    connectedCount: connectedEndpoints.size,
    pluginName: getPluginName(),
  };
}

export async function checkNearbyPermissions() {
  const plugin = getPlugin();

  if (!plugin || typeof plugin.checkPermissions !== "function") {
    return { nearby: "unknown", location: "unknown" };
  }

  try {
    const status = await plugin.checkPermissions();
    return normalizePermissions(status);
  } catch (error) {
    console.warn(
      "Vérification des permissions Nearby impossible:",
      error
    );

    return { nearby: "unknown", location: "unknown" };
  }
}

export async function requestNearbyPermissions() {
  const plugin = getPlugin();

  if (!plugin) {
    return { nearby: "unknown", location: "unknown" };
  }

  if (typeof plugin.requestPermissions !== "function") {
    return checkNearbyPermissions();
  }

  try {
    await plugin.requestPermissions();
  } catch (error) {
    console.warn(
      "Demande de permissions Nearby impossible:",
      error
    );
  }

  return checkNearbyPermissions();
}

async function ensureInitialized() {
  if (isInitialized) return;

  const plugin = requirePlugin();

  // Le plugin Kotlin fourni ne nécessite pas de méthode initialize().
  if (typeof plugin.initialize === "function") {
    await plugin.initialize({
      serviceName: SERVICE_NAME,
      strategy: 1,
    });
  }

  isInitialized = true;
}

export async function startNearby(displayName = "BAARO User") {
  if (isStarting) {
    throw new Error("Le démarrage de Nearby est déjà en cours.");
  }

  if (isStopping) {
    throw new Error("Arrête Nearby avant de le redémarrer.");
  }

  assertAndroid();

  if (!isNearbyAvailable()) {
    throw new Error(
      "Plugin Nearby indisponible. Vérifie son enregistrement Android et reconstruis l’APK."
    );
  }

  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("Le nom de l’appareil est invalide.");
  }

  isStarting = true;

  try {
    let permissions = await checkNearbyPermissions();

    if (
      permissions.nearby !== "granted" ||
      permissions.location !== "granted"
    ) {
      permissions = await requestNearbyPermissions();
    }

    assertPermissionsGranted(permissions);
    await ensureInitialized();

    const plugin = requirePlugin();
    const name = displayName.trim();

    if (typeof plugin.start === "function") {
      await plugin.start({ displayName: name });
      return;
    }

    if (typeof plugin.startAdvertising === "function") {
      await plugin.startAdvertising({ name });

      if (typeof plugin.startDiscovery === "function") {
        try {
          await plugin.startDiscovery();
        } catch (error) {
          try {
            if (typeof plugin.stopAdvertising === "function") {
              await plugin.stopAdvertising();
            }
          } catch (stopError) {
            console.warn(
              "Impossible d'arrêter la diffusion après l'échec de la découverte:",
              stopError
            );
          }

          throw error;
        }
      }

      return;
    }

    throw new Error(
      "Le plugin Nearby ne fournit aucune méthode de démarrage reconnue."
    );
  } catch (error) {
    isInitialized = false;
    throw new Error(getErrorMessage(error));
  } finally {
    isStarting = false;
  }
}

export async function stopNearby() {
  if (isStopping) return;

  if (isStarting) {
    throw new Error(
      "Le démarrage de Nearby est en cours. Réessaie après sa fin."
    );
  }

  isStopping = true;

  try {
    const plugin = getPlugin();

    if (!plugin) {
      connectedEndpoints.clear();
      isInitialized = false;
      return;
    }

    if (typeof plugin.stop === "function") {
      await plugin.stop();
    } else {
      const methods = [
        ["stopAdvertising", plugin.stopAdvertising],
        ["stopDiscovery", plugin.stopDiscovery],
      ];

      let foundMethod = false;
      let firstError = null;

      for (const [name, method] of methods) {
        if (typeof method !== "function") continue;

        foundMethod = true;

        try {
          await method.call(plugin);
        } catch (error) {
          if (!firstError) {
            firstError = new Error(
              `${name}: ${getErrorMessage(error)}`
            );
          }
        }
      }

      if (firstError) throw firstError;

      if (!foundMethod) {
        throw new Error(
          "Le plugin Nearby ne fournit aucune méthode d'arrêt reconnue."
        );
      }
    }

    connectedEndpoints.clear();
    isInitialized = false;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  } finally {
    isStopping = false;
  }
}

export async function sendNearbyMessage(text, endpointId = null) {
  const plugin = requirePlugin();

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Le message Nearby ne peut pas être vide.");
  }

  const payload = text;

  if (endpointId !== null && endpointId !== undefined) {
    endpointId = requireEndpointId(endpointId);
  }

  if (typeof plugin.send === "function") {
    await plugin.send({
      text: payload,
      ...(endpointId ? { endpointId } : {}),
    });

    return;
  }

  if (typeof plugin.sendMessage === "function") {
    if (endpointId) {
      if (!connectedEndpoints.has(endpointId)) {
        throw new Error("Cet appareil n'est pas connecté.");
      }

      await plugin.sendMessage({
        endpointId,
        data: payload,
      });

      return;
    }

    const endpoints = [...connectedEndpoints];

    if (endpoints.length === 0) {
      throw new Error("Aucun appareil Nearby n'est connecté.");
    }

    for (const id of endpoints) {
      await plugin.sendMessage({
        endpointId: id,
        data: payload,
      });
    }

    return;
  }

  throw new Error(
    "Le plugin Nearby ne fournit aucune méthode d'envoi reconnue."
  );
}

export async function acceptNearbyConnection(endpointId) {
  endpointId = requireEndpointId(endpointId);

  const plugin = requirePlugin();

  if (typeof plugin.accept === "function") {
    await plugin.accept({ endpointId });
  } else if (typeof plugin.acceptConnection === "function") {
    await plugin.acceptConnection({ endpointId });
  } else {
    throw new Error(
      "Le plugin Nearby ne fournit aucune méthode d'acceptation de connexion."
    );
  }

  // DEVICE_CONNECTED confirme l'établissement réel de la connexion.
}

export async function rejectNearbyConnection(endpointId) {
  endpointId = requireEndpointId(endpointId);

  const plugin = requirePlugin();

  if (typeof plugin.reject === "function") {
    await plugin.reject({ endpointId });
  } else if (typeof plugin.rejectConnection === "function") {
    await plugin.rejectConnection({ endpointId });
  } else {
    throw new Error(
      "Le plugin Nearby ne fournit aucune méthode de refus de connexion."
    );
  }

  connectedEndpoints.delete(endpointId);
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;

  const type = event.type;
  const endpointId = event.endpointId ?? event.endpoint?.id ?? null;
  const deviceName =
    event.deviceName ?? event.endpointName ?? event.name ?? null;

  switch (type) {
    case "DEVICE_FOUND":
    case "DEVICE_CONNECTED":
      return { type, endpointId, deviceName };

    case "DEVICE_LOST":
      return { type, endpointId };

    case "MESSAGE_RECEIVED":
      return {
        type,
        endpointId,
        text: event.text ?? event.data,
        senderName: event.senderName ?? event.endpointName ?? "Proche",
      };

    case "CONNECTION_REQUESTED":
      return { type, endpointId, deviceName };

    case "ERROR":
      return {
        type,
        message: event.message || "Erreur du service Nearby.",
      };

    default:
      return null;
  }
}

export function onNearbyEvent(_eventName, callback) {
  const plugin = getPlugin();

  if (!plugin || typeof plugin.addListener !== "function") {
    return { remove: async () => {} };
  }

  let removed = false;
  const handles = [];
  const pendingRegistrations = [];

  const subscribe = (eventName, handler) => {
    try {
      const registration = Promise.resolve(
        plugin.addListener(eventName, handler)
      )
        .then(async (handle) => {
          if (removed) {
            await handle?.remove?.();
          } else if (handle) {
            handles.push(handle);
          }
        })
        .catch((error) => {
          console.warn(
            `Impossible d'enregistrer l'événement Nearby "${eventName}":`,
            error
          );
        });

      pendingRegistrations.push(registration);
    } catch (error) {
      console.warn(
        `Impossible d'enregistrer l'événement Nearby "${eventName}":`,
        error
      );
    }
  };

  const dispatch = (rawEvent) => {
    const event = normalizeEvent(rawEvent);
    if (!event) return;

    if (event.type === "DEVICE_CONNECTED" && event.endpointId) {
      connectedEndpoints.add(event.endpointId);
    } else if (event.type === "DEVICE_LOST" && event.endpointId) {
      connectedEndpoints.delete(event.endpointId);
    }

    try {
      callback(event);
    } catch (error) {
      console.error(
        "Erreur dans le gestionnaire d'événements Nearby:",
        error
      );
    }
  };

  if (getPluginName() === "NearbyChat") {
    subscribe("nearbyEvent", dispatch);
  } else {
    subscribe("onEndpointFound", (data) =>
      dispatch({
        ...data,
        type: "DEVICE_FOUND",
        endpointId: data?.endpointId,
        deviceName: data?.endpointName ?? data?.name,
      })
    );

    subscribe("onConnectionResult", (data) => {
      if (data?.result === "SUCCESS" || data?.status === "SUCCESS") {
        dispatch({ ...data, type: "DEVICE_CONNECTED" });
      } else {
        dispatch({
          type: "ERROR",
          message: data?.message || "La connexion Nearby a échoué.",
        });
      }
    });

    subscribe("onMessageReceived", (data) =>
      dispatch({
        ...data,
        type: "MESSAGE_RECEIVED",
        text: data?.data ?? data?.text,
        senderName: data?.endpointName ?? data?.senderName ?? "Proche",
      })
    );

    subscribe("onConnectionRequested", (data) =>
      dispatch({
        ...data,
        type: "CONNECTION_REQUESTED",
      })
    );
  }

  return {
    async remove() {
      if (removed) return;

      removed = true;
      await Promise.allSettled(pendingRegistrations);

      const registeredHandles = handles.splice(0);

      await Promise.allSettled(
        registeredHandles.map((handle) => handle?.remove?.())
      );
    },
  };
}
