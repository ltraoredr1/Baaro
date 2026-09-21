/**
 * Hook de messagerie avec chiffrement E2E.
 * - Chiffre avant insert
 * - Déchiffre à la réception / au chargement
 * - Rétrocompatible avec les anciens messages en clair
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import {
  encryptMessage,
  decryptMessage,
  serializePayload,
  deserializePayload,
} from "../lib/crypto.js";
import { useCryptoKeys } from "./useCryptoKeys.js";

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

  // Reset cache si on change de conversation
  useEffect(() => {
    recipientKeyCache.current = null;
  }, [recipientId]);

  const decryptOne = useCallback(
    async (rawMsg) => {
      try {
        const payload = deserializePayload(rawMsg.text);
        if (!payload) {
          return {...rawMsg, plaintext: rawMsg.text, encrypted: false };
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
          plaintext: plain?? "[Impossible de déchiffrer]",
          encrypted: true,
          decryptFailed:!plain,
        };
      } catch {
        return {...rawMsg, plaintext: rawMsg.text, encrypted: false };
      }
    },
    [privateKey, currentUserId]
  );

  useEffect(() => {
    if (!conversationId ||!currentUserId ||!keysReady) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      let { data, error } = await supabase
       .from("messages")
       .select("*, sender:sender_id(display_name, flag, avatar_url)")
       .eq("conversation_id", conversationId)
       .order("created_at", { ascending: true })
       .limit(100);

      if (error) {
        const plain = await supabase
         .from("messages")
         .select("*")
         .eq("conversation_id", conversationId)
         .order("created_at", { ascending: true })
         .limit(100);
        data = plain.data;
        error = plain.error;
      }

      if (error || cancelled) {
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
            setMessages((prev) =>
              prev.some((m) => m.id === decrypted.id)? prev : [...prev, decrypted]
            );
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
      if (!text?.trim() ||!conversationId ||!currentUserId ||!recipientId) {
        return { ok: false, error: "Paramètres manquants" };
      }
      if (!keysReady) return { ok: false, error: "Clés pas prêtes" };
      setSendError(null);

      try {
        let recipientPub = recipientKeyCache.current;
        if (!recipientPub) {
          recipientPub = await fetchRecipientPublicKey(recipientId);
          if (!recipientPub) {
            const err = "Contact sans clé publique — il doit ouvrir l'app une fois.";
            setSendError(err);
            return { ok: false, error: err };
          }
          recipientKeyCache.current = recipientPub;
        }
        if (!myPublicKeyJwk) return { ok: false, error: "Clé locale manquante" };

        const payload = await encryptMessage(text.trim(), [
          { userId: recipientId, publicKeyJwk: recipientPub },
          { userId: currentUserId, publicKeyJwk: myPublicKeyJwk },
        ]);

        const { data, error } = await supabase
         .from("messages")
         .insert({
            conversation_id: conversationId,
            sender_id: currentUserId, // = profiles.id
            text: serializePayload(payload),
          })
         .select()
         .single();

        if (error) throw error;

        setMessages((prev) => [
         ...prev,
          {...data, plaintext: text.trim(), encrypted: true, decryptFailed: false },
        ]);
        return { ok: true };
      } catch (err) {
        const msg = err.message || "Échec envoi";
        setSendError(msg);
        return { ok: false, error: msg };
      }
    },
    [conversationId, currentUserId, recipientId, keysReady, myPublicKeyJwk, fetchRecipientPublicKey]
  );

  return { messages, loading: loading ||!keysReady, sendMessage, sendError, keysReady };
}
