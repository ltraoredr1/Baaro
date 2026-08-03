/**
 * Hook de messagerie avec chiffrement E2E.
 * - Chiffre avant insert
 * - Déchiffre à la réception / au chargement
 * - Rétrocompatible avec les anciens messages en clair
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import {
  encryptMessage,
  decryptMessage,
  serializePayload,
  deserializePayload,
} from "../lib/crypto";
import { useCryptoKeys } from "./useCryptoKeys";

export function useMessaging(conversationId, currentUserId, recipientId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState(null);

  const {
    privateKey,
    publicKeyJwk: myPublicKeyJwk,
    ready: keysReady,
    fetchRecipientPublicKey,
  } = useCryptoKeys(currentUserId);

  const recipientKeyCache = useRef(null);

  const decryptOne = useCallback(
    async (rawMsg) => {
      const payload = deserializePayload(rawMsg.text);

      if (!payload) {
        return { ...rawMsg, plaintext: rawMsg.text, encrypted: false };
      }

      if (!privateKey) {
        return {
          ...rawMsg,
          plaintext: "[Message chiffré — clés non prêtes]",
          encrypted: true,
          decryptFailed: true,
        };
      }

      const plain = await decryptMessage(payload, privateKey, currentUserId);
      return {
        ...rawMsg,
        plaintext: plain ?? "[Impossible de déchiffrer ce message]",
        encrypted: true,
        decryptFailed: !plain,
      };
    },
    [privateKey, currentUserId]
  );

  useEffect(() => {
    if (!conversationId || !currentUserId || !keysReady) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*, sender:sender_id(display_name, flag, avatar_url)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[useMessaging] fetch:", error);
        setLoading(false);
        return;
      }

      const decrypted = await Promise.all((data || []).map(decryptOne));
      if (!cancelled) {
        setMessages(decrypted);
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`e2e-room:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const decrypted = await decryptOne(payload.new);
          if (!cancelled) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === decrypted.id)) return prev;
              return [...prev, decrypted];
            });
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, keysReady, decryptOne]);

  const sendMessage = useCallback(
    async (text) => {
      if (!text?.trim() || !conversationId || !currentUserId || !recipientId) {
        return { ok: false, error: "Paramètres manquants" };
      }
      if (!keysReady) {
        return { ok: false, error: "Clés crypto pas encore prêtes" };
      }

      setSendError(null);

      try {
        let recipientPub = recipientKeyCache.current;
        if (!recipientPub) {
          recipientPub = await fetchRecipientPublicKey(recipientId);
          if (!recipientPub) {
            const err =
              "Ce contact n'a pas encore de clé publique. Il doit ouvrir l'application une fois pour générer ses clés.";
            setSendError(err);
            return { ok: false, error: err };
          }
          recipientKeyCache.current = recipientPub;
        }

        if (!myPublicKeyJwk) {
          return { ok: false, error: "Clé publique locale manquante" };
        }

        const payload = await encryptMessage(text.trim(), [
          { userId: recipientId, publicKeyJwk: recipientPub },
          { userId: currentUserId, publicKeyJwk: myPublicKeyJwk },
        ]);
        const serialized = serializePayload(payload);

        const { data, error } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: currentUserId,
            text: serialized,
          })
          .select()
          .single();

        if (error) throw error;

        setMessages((prev) => [
          ...prev,
          {
            ...data,
            plaintext: text.trim(),
            encrypted: true,
            decryptFailed: false,
          },
        ]);

        return { ok: true };
      } catch (err) {
        console.error("[useMessaging] send:", err);
        const msg = err.message || "Échec de l'envoi";
        setSendError(msg);
        return { ok: false, error: msg };
      }
    },
    [
      conversationId,
      currentUserId,
      recipientId,
      keysReady,
      myPublicKeyJwk,
      fetchRecipientPublicKey,
    ]
  );

  return {
    messages,
    loading: loading || !keysReady,
    sendMessage,
    sendError,
    keysReady,
  };
}
