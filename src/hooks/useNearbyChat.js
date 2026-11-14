
import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

import {
  isNearbyAvailable,
  getNearbyDebug,
  startNearby,
  stopNearby,
  sendNearbyMessage,
  requestNearbyConnection,
  onNearbyEvent,
  acceptNearbyConnection,
  rejectNearbyConnection,
} from "../nearby.js";

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Une erreur inattendue est survenue avec Nearby.";
}

function normalizeEndpointId(event) {
  return event?.endpointId ?? event?.endpoint?.id ?? null;
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_MESSAGE_IDS = 512;
const MAX_MESSAGE_HISTORY = 200;
const MAX_SCAN_WINDOW_MS = 5 * 60_000;

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
  const [pendingConnections, setPendingConnections] = useState([]);
  const [messages, setMessages] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState(null);
  const [isOperating, setIsOperating] = useState(false);

  const operationRef = useRef(null);
  const scanningRef = useRef(false);
  const scanTimerRef = useRef(null);
  const pendingTimersRef = useRef(new Map());
  const receivedMessageIdsRef = useRef(new Set());

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

  // Un changement d’onglet démonte OfflineTab. Sans ce nettoyage, le plugin
  // continuait à diffuser/découvrir en arrière-plan et l’écran suivant pouvait
  // hériter d’une session native que son état React ne connaissait plus.
  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current.clear();
      if (!scanningRef.current) return;
      scanningRef.current = false;
      void stopNearby().catch((err) => {
        console.warn("Impossible d'arrêter Nearby au démontage :", err);
      });
    };
  }, []);

  // Écoute les événements natifs lorsque le plugin est disponible.
  useEffect(() => {
    if (!isAvailable) return undefined;

    let listener;

    try {
      listener = onNearbyEvent("nearbyEvent", (event) => {
        if (!event || typeof event.type !== "string") return;

        const endpointId = normalizeEndpointId(event);

        switch (event.type) {
          case "STARTED":
            scanningRef.current = true;
            setIsScanning(true);
            break;

          case "STOPPED":
            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
            scanTimerRef.current = null;
            scanningRef.current = false;
            setIsScanning(false);
            setDevices([]);
            setPendingConnections([]);
            setTransfers([]);
            pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
            pendingTimersRef.current.clear();
            receivedMessageIdsRef.current.clear();
            refreshStatus();
            break;

          case "DEVICE_FOUND": {
            if (!endpointId) return;

            setDevices((previous) => {
              const existing = previous.find(
                (device) => device.endpointId === endpointId
              );

              if (existing) {
                if (!event.deviceName || existing.name === event.deviceName) {
                  return previous;
                }
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
            setPendingConnections((previous) =>
              previous.filter((request) => request.endpointId !== endpointId)
            );

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
            const timer = pendingTimersRef.current.get(endpointId);
            if (timer) clearTimeout(timer);
            pendingTimersRef.current.delete(endpointId);
            setPendingConnections((previous) =>
              previous.filter((request) => request.endpointId !== endpointId)
            );

            setDevices((previous) =>
              previous.filter(
                (device) => device.endpointId !== endpointId
              )
            );
            break;
          }

          case "MESSAGE_RECEIVED": {
            if (typeof event.text !== "string") return;

            if (event.messageId) {
              const ids = receivedMessageIdsRef.current;
              if (ids.has(event.messageId)) return;
              ids.add(event.messageId);
              if (ids.size > MAX_MESSAGE_IDS) {
                ids.delete(ids.values().next().value);
              }
            }

            setMessages((previous) => [
              ...previous,
              {
                from: event.senderName || "Utilisateur inconnu",
                text: event.text,
                timestamp: event.timestamp || Date.now(),
                messageId: event.messageId || null,
                isMe: false,
              },
            ].slice(-MAX_MESSAGE_HISTORY));
            break;
          }

          case "TRANSFER_UPDATE": {
            if (!Number.isFinite(Number(event.payloadId))) return;
            const update = {
              endpointId,
              payloadId: Number(event.payloadId),
              status: event.status || "UNKNOWN",
              bytesTransferred: Number(event.bytesTransferred) || 0,
              totalBytes: Number(event.totalBytes) || 0,
              updatedAt: Date.now(),
            };
            setTransfers((previous) => [
              ...previous.filter(
                (transfer) =>
                  transfer.endpointId !== update.endpointId ||
                  transfer.payloadId !== update.payloadId
              ),
              update,
            ].slice(-100));
            if (update.status === "FAILURE") {
              setError("Le transfert Nearby a échoué.");
            } else if (update.status === "CANCELED") {
              setError("Le transfert Nearby a été annulé.");
            }
            break;
          }

          case "CONNECTION_REQUESTED": {
            if (!endpointId) return;
            const requestId = `${endpointId}-${Date.now()}-${Math.random()}`;
            const oldTimer = pendingTimersRef.current.get(endpointId);
            if (oldTimer) clearTimeout(oldTimer);
            pendingTimersRef.current.set(
              endpointId,
              setTimeout(() => {
                pendingTimersRef.current.delete(endpointId);
                setPendingConnections((previous) =>
                  previous.filter((request) => request.endpointId !== endpointId)
                );
              }, REQUEST_TIMEOUT_MS)
            );
            setPendingConnections((previous) => [
              ...previous.filter((request) => request.endpointId !== endpointId),
              {
                endpointId,
                requestId,
                deviceName: event.deviceName || "Appareil inconnu",
                authToken: event.authToken || null,
              },
            ]);
            break;
          }

          case "ERROR":
            if (endpointId) {
              setDevices((previous) =>
                previous.map((device) =>
                  device.endpointId === endpointId && device.status === "connecting"
                    ? { ...device, status: "available" }
                    : device
                )
              );
            }
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
  }, [isAvailable, refreshStatus]);

  const start = useCallback(async () => {
    if (operationRef.current) {
      throw new Error("Une opération Nearby est déjà en cours.");
    }

    operationRef.current = "starting";
    setIsOperating(true);

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

      await startNearby(displayName);

      scanningRef.current = true;
      setIsScanning(true);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => {
        scanTimerRef.current = null;
        if (!scanningRef.current || operationRef.current) return;
        scanningRef.current = false;
        setIsScanning(false);
        void stopNearby().catch((err) => {
          setError(getErrorMessage(err));
        });
      }, MAX_SCAN_WINDOW_MS);
      refreshStatus();
    } catch (err) {
      scanningRef.current = false;
      setIsScanning(false);

      const message = getErrorMessage(err);
      setError(message);

      throw err instanceof Error ? err : new Error(message);
    } finally {
      operationRef.current = null;
      setIsOperating(false);
    }
  }, [displayName, refreshStatus]);

  const stop = useCallback(async () => {
    if (operationRef.current) {
      throw new Error(
        "Une autre opération Nearby est déjà en cours."
      );
    }

    operationRef.current = "stopping";
    setIsOperating(true);

    try {
      setError(null);
      await stopNearby();

      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
      scanningRef.current = false;
      setIsScanning(false);
      setDevices([]);
      setPendingConnections([]);
      refreshStatus();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      operationRef.current = null;
      setIsOperating(false);
    }
  }, [refreshStatus]);

  const sendMessage = useCallback(async (text, endpointId = null) => {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Le message ne peut pas être vide.");
    }

    try {
      setError(null);

      if (operationRef.current === "stopping") {
        throw new Error("Attends la fin de l'arrêt de Nearby avant d'envoyer un message.");
      }
      if (!scanningRef.current) {
        throw new Error("Démarre Nearby avant d'envoyer un message.");
      }

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

  const requestConnection = useCallback(async (endpointId) => {
    if (!endpointId) throw new Error("Identifiant de l’appareil manquant.");

    try {
      setError(null);
      await requestNearbyConnection(endpointId);
      setDevices((previous) =>
        previous.map((device) =>
          device.endpointId === endpointId && device.status !== "connected"
            ? { ...device, status: "connecting" }
            : device
        )
      );
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const acceptConnection = useCallback(async (endpointId, authenticationConfirmed) => {
    if (!endpointId) {
      throw new Error("Identifiant de connexion manquant.");
    }

    try {
      setError(null);
      await acceptNearbyConnection(endpointId, authenticationConfirmed);
      const timer = pendingTimersRef.current.get(endpointId);
      if (timer) clearTimeout(timer);
      pendingTimersRef.current.delete(endpointId);
      setPendingConnections((previous) =>
        previous.filter((request) => request.endpointId !== endpointId)
      );
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
      const timer = pendingTimersRef.current.get(endpointId);
      if (timer) clearTimeout(timer);
      pendingTimersRef.current.delete(endpointId);
      setPendingConnections((previous) =>
        previous.filter((request) => request.endpointId !== endpointId)
      );
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
    isOperating,
    isScanning,
    devices,
    pendingConnections,
    messages,
    transfers,
    error,
    refreshStatus,
    start,
    stop,
    sendMessage,
    requestConnection,
    acceptConnection,
    rejectConnection,
  };
}
