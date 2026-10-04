import { useState, useEffect, useCallback } from "react";
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
import { Capacitor } from "@capacitor/core";

export function useNearbyChat(displayName = "Utilisateur BAARO") {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [debug, setDebug] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    setIsAvailable(isNearbyAvailable());
    setDebug(getNearbyDebug());
  }, []);

  useEffect(() => {
    if (!isAvailable) return;
    const listener = onNearbyEvent("nearbyEvent", (event) => {
      if (event.type === "DEVICE_FOUND") {
        setDevices((prev) => prev.find((d) => d.endpointId === event.endpointId)? prev : [...prev, { endpointId: event.endpointId, name: event.deviceName || "Inconnu", status: "available" }]);
      } else if (event.type === "DEVICE_CONNECTED") {
        setDevices((prev) => prev.map((d) => d.endpointId === event.endpointId? {...d, status: "connected" } : d));
      } else if (event.type === "MESSAGE_RECEIVED") {
        setMessages((prev) => [...prev, { from: event.senderName || "Inconnu", text: event.text, timestamp: Date.now(), isMe: false }]);
      } else if (event.type === "DEVICE_LOST") {
        setDevices((prev) => prev.filter((d) => d.endpointId!== event.endpointId));
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
      const perms = await checkNearbyPermissions();
      if (perms.nearby!== "granted" || perms.location!== "granted") {
        const req = await requestNearbyPermissions();
        if (req.nearby!== "granted") throw new Error("Permission Bluetooth refusée");
      }
      await startNearby(displayName);
      setIsScanning(true);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [displayName]);

  const stop = useCallback(async () => {
    await stopNearby();
    setIsScanning(false);
    setDevices([]);
  }, []);

  const sendMessage = useCallback(async (text, endpointId = null) => {
    await sendNearbyMessage(text, endpointId);
    setMessages((prev) => [...prev, { from: "Moi", text, timestamp: Date.now(), isMe: true }]);
  }, []);

  return { isAvailable, isNative, debug, isScanning, devices, messages, error, start, stop, sendMessage, acceptConnection: acceptNearbyConnection, rejectConnection: rejectNearbyConnection };
}
