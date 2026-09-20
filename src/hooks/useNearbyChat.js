import { useState, useEffect, useCallback } from "react";
import {
  isNearbyAvailable,
  startNearby,
  stopNearby,
  sendNearbyMessage,
  onNearbyEvent,
  acceptNearbyConnection,
  rejectNearbyConnection,
  checkNearbyPermissions,
  requestNearbyPermissions,
} from "../lib/nearby.js";

/**
 * Hook React pour gérer le chat hors-ligne via Google Nearby Connections.
 * Gère automatiquement les permissions, la découverte d'appareils et le nettoyage.
 */
export function useNearbyChat(displayName = "Utilisateur BAARO") {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsAvailable(isNearbyAvailable());
  }, []);

  useEffect(() => {
    if (!isAvailable) return;

    const listener = onNearbyEvent("nearbyEvent", (event) => {
      if (event.type === "DEVICE_FOUND") {
        setDevices((prev) => {
          if (prev.find((d) => d.endpointId === event.endpointId)) return prev;
          return [
            ...prev,
            {
              endpointId: event.endpointId,
              name: event.deviceName || "Appareil inconnu",
              status: "available",
            },
          ];
        });
      } else if (event.type === "DEVICE_CONNECTED") {
        setDevices((prev) =>
          prev.map((d) =>
            d.endpointId === event.endpointId ? { ...d, status: "connected" } : d
          )
        );
      } else if (event.type === "MESSAGE_RECEIVED") {
        setMessages((prev) => [
          ...prev,
          {
            from: event.senderName || "Inconnu",
            text: event.text,
            timestamp: Date.now(),
            isMe: false,
          },
        ]);
      } else if (event.type === "DEVICE_LOST" || event.type === "DEVICE_DISCONNECTED") {
        setDevices((prev) => prev.filter((d) => d.endpointId !== event.endpointId));
      } else if (event.type === "ERROR") {
        setError(event.message);
      }
    });

    return () => {
      listener.remove();
      stopNearby();
    };
  }, [isAvailable]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const permissions = await checkNearbyPermissions();

      if (permissions.nearby !== "granted" || permissions.location !== "granted") {
        const requestResult = await requestNearbyPermissions();
        if (requestResult.nearby !== "granted" || requestResult.location !== "granted") {
          setError(
            "Les permissions Bluetooth et Localisation sont obligatoires pour le mode hors-ligne."
          );
          return;
        }
      }

      await startNearby(displayName);
      setIsScanning(true);
    } catch (err) {
      console.error("Erreur démarrage Nearby:", err);
      setError(err.message || "Impossible de démarrer le mode hors-ligne.");
    }
  }, [displayName]);

  const stop = useCallback(async () => {
    await stopNearby();
    setIsScanning(false);
    setDevices([]);
  }, []);

  const sendMessage = useCallback(async (text, endpointId = null) => {
    try {
      await sendNearbyMessage(text, endpointId);
      setMessages((prev) => [
        ...prev,
        { from: "Moi", text, timestamp: Date.now(), isMe: true },
      ]);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    isAvailable,
    isScanning,
    devices,
    messages,
    error,
    start,
    stop,
    sendMessage,
    clearMessages,
    acceptConnection: acceptNearbyConnection,
    rejectConnection: rejectNearbyConnection,
  };
}
