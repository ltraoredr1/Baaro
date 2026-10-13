
import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

import {
  isNearbyAvailable,
  getNearbyDebug,
  startNearby,
  stopNearby,
  sendNearbyMessage,
  onNearbyEvent,
  acceptNearbyConnection,
  rejectNearbyConnection,
  checkNearbyPermissions,
  requestNearbyPermissions,
} from "../lib/nearby.js";

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Une erreur inattendue est survenue avec Nearby.";
}

function hasRequiredPermissions(permissions) {
  return (
    permissions?.nearby === "granted" &&
    permissions?.location === "granted"
  );
}

function normalizeEndpointId(event) {
  return event?.endpointId ?? event?.endpoint?.id ?? null;
}

export function useNearbyChat(displayName = "Utilisateur BAARO") {
  const [isNative, setIsNative] = useState(() =>
    Capacitor.isNativePlatform()
  );

  const [isAvailable, setIsAvailable] = useState(() =>
    isNearbyAvailable()
  );

  const [debug, setDebug] = useState(() => getNearbyDebug());
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  const operationRef = useRef(null);
  const scanningRef = useRef(false);

  const refreshStatus = useCallback(() => {
    try {
      setIsNative(Capacitor.isNativePlatform());
      setIsAvailable(isNearbyAvailable());
      setDebug(getNearbyDebug());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Écoute les événements natifs lorsque le plugin est disponible.
  useEffect(() => {
    if (!isAvailable) return undefined;

    let listener;

    try {
      listener = onNearbyEvent("nearbyEvent", (event) => {
        if (!event || typeof event.type !== "string") return;

        const endpointId = normalizeEndpointId(event);

        switch (event.type) {
          case "DEVICE_FOUND": {
            if (!endpointId) return;

            setDevices((previous) => {
              const existing = previous.find(
                (device) => device.endpointId === endpointId
              );

              if (existing) {
                return previous.map((device) =>
                  device.endpointId === endpointId
                    ? {
                        ...device,
                        name: event.deviceName || device.name,
                      }
                    : device
                );
              }

              return [
                ...previous,
                {
                  endpointId,
                  name: event.deviceName || "Appareil inconnu",
                  status: "available",
                },
              ];
            });
            break;
          }

          case "DEVICE_CONNECTED": {
            if (!endpointId) return;

            setDevices((previous) => {
              const existing = previous.some(
                (device) => device.endpointId === endpointId
              );

              if (!existing) {
                return [
                  ...previous,
                  {
                    endpointId,
                    name: event.deviceName || "Appareil inconnu",
                    status: "connected",
                  },
                ];
              }

              return previous.map((device) =>
                device.endpointId === endpointId
                  ? {
                      ...device,
                      name: event.deviceName || device.name,
                      status: "connected",
                    }
                  : device
              );
            });
            break;
          }

          case "DEVICE_LOST": {
            if (!endpointId) return;

            setDevices((previous) =>
              previous.filter(
                (device) => device.endpointId !== endpointId
              )
            );
            break;
          }

          case "MESSAGE_RECEIVED": {
            if (typeof event.text !== "string") return;

            setMessages((previous) => [
              ...previous,
              {
                from: event.senderName || "Utilisateur inconnu",
                text: event.text,
                timestamp: Date.now(),
                isMe: false,
              },
            ]);
            break;
          }

          case "CONNECTION_REQUESTED":
            // La décision d'accepter ou de refuser doit rester explicite.
            // L'interface peut utiliser acceptConnection/rejectConnection.
            break;

          case "ERROR":
            setError(
              typeof event.message === "string"
                ? event.message
                : "Erreur du service Nearby."
            );
            break;

          default:
            break;
        }
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }

    return () => {
      try {
        listener?.remove?.();
      } catch (err) {
        console.warn("Impossible de retirer le listener Nearby :", err);
      }
    };
  }, [isAvailable]);

  const start = useCallback(async () => {
    if (operationRef.current) {
      throw new Error("Une opération Nearby est déjà en cours.");
    }

    operationRef.current = "starting";

    try {
      setError(null);

      if (!Capacitor.isNativePlatform()) {
        throw new Error(
          "Le chat Nearby nécessite une application native compatible."
        );
      }

      refreshStatus();

      if (!isNearbyAvailable()) {
        throw new Error(
          "Le plugin Nearby n'est pas disponible sur cet appareil."
        );
      }

      let permissions = await checkNearbyPermissions();

      if (!hasRequiredPermissions(permissions)) {
        permissions = await requestNearbyPermissions();
      }

      // Ne pas démarrer si une permission nécessaire est refusée,
      // absente ou inconnue.
      if (!hasRequiredPermissions(permissions)) {
        throw new Error(
          "Les permissions Bluetooth et localisation nécessaires ne sont pas accordées."
        );
      }

      await startNearby(displayName);

      scanningRef.current = true;
      setIsScanning(true);
      refreshStatus();
    } catch (err) {
      scanningRef.current = false;
      setIsScanning(false);

      const message = getErrorMessage(err);
      setError(message);

      throw err instanceof Error ? err : new Error(message);
    } finally {
      operationRef.current = null;
    }
  }, [displayName, refreshStatus]);

  const stop = useCallback(async () => {
    if (operationRef.current) {
      throw new Error(
        "Une autre opération Nearby est déjà en cours."
      );
    }

    operationRef.current = "stopping";

    try {
      setError(null);
      await stopNearby();

      scanningRef.current = false;
      setIsScanning(false);
      setDevices([]);
      refreshStatus();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      operationRef.current = null;
    }
  }, [refreshStatus]);

  const sendMessage = useCallback(async (text, endpointId = null) => {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Le message ne peut pas être vide.");
    }

    if (!scanningRef.current) {
      throw new Error(
        "Démarre Nearby avant d'envoyer un message."
      );
    }

    try {
      setError(null);

      const messageText = text.trim();

      await sendNearbyMessage(messageText, endpointId);

      setMessages((previous) => [
        ...previous,
        {
          from: "Moi",
          text: messageText,
          timestamp: Date.now(),
          isMe: true,
        },
      ]);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const acceptConnection = useCallback(async (endpointId) => {
    if (!endpointId) {
      throw new Error("Identifiant de connexion manquant.");
    }

    try {
      setError(null);
      await acceptNearbyConnection(endpointId);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const rejectConnection = useCallback(async (endpointId) => {
    if (!endpointId) {
      throw new Error("Identifiant de connexion manquant.");
    }

    try {
      setError(null);
      await rejectNearbyConnection(endpointId);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  return {
    isAvailable,
    isNative,
    debug,
    isScanning,
    devices,
    messages,
    error,
    refreshStatus,
    start,
    stop,
    sendMessage,
    acceptConnection,
    rejectConnection,
  };
}
