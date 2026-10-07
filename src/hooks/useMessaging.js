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

export function useMessaging(conversation_id, current_user_id, recipient_id) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState(null);

  const {
    privateKey,
    publicKeyJwk: myPublicKeyJwk,
    ready: keysReady,
    fetchRecipientPublicKey,
  } = useCryptoKeys(current_user_id);

  const recipientKeyCache = useRef(null);

  // Reset cache si on change de conversation
  useEffect(() => {
    recipientKeyCache.current = null;
  }, [recipient_id]);

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
        const plain = await decryptMessage(payload, privateKey, current_user_id);
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
    [privateKey, current_user_id]
  );

  useEffect(() => {
    if (!conversation_id ||!current_user_id ||!keysReady) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      let { data, error } = await supabase
       .from("messages")
       .select("*, sender:sender_id(display_name, flag, avatar_url)")
       .eq("conversation_id", conversation_id)
       .order("created_at", { ascending: true })
       .limit(100);

      if (error) {
        const plain = await supabase
         .from("messages")
         .select("*")
         .eq("conversation_id", conversation_id)
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
     .channel(`e2e-room:${conversation_id}`)
     .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation_id}`,
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
  }, [conversation_id, current_user_id, keysReady, decryptOne]);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      if (!text?.trim() ||!conversation_id ||!current_user_id ||!recipient_id) {
        return { ok: false, error: "Paramètres manquants" };
      }
      if (!keysReady) return { ok: false, error: "Clés pas prêtes" };
      setSendError(null);

      try {
        let recipientPub = recipientKeyCache.current;
        if (!recipientPub) {
          recipientPub = await fetchRecipientPublicKey(recipient_id);
          if (!recipientPub) {
            const err = "Contact sans clé publique — il doit ouvrir l'app une fois.";
            setSendError(err);
            return { ok: false, error: err };
          }
          recipientKeyCache.current = recipientPub;
        }
        if (!myPublicKeyJwk) return { ok: false, error: "Clé locale manquante" };

        const payload = await encryptMessage(text.trim(), [
          { user_id: recipient_id, publicKeyJwk: recipientPub },
          { user_id: current_user_id, publicKeyJwk: myPublicKeyJwk },
        ]);

        const { data, error } = await supabase
         .from("messages")
         .insert({
            conversation_id: conversation_id,
            sender_id: current_user_id, // = profiles.id
            recipient_id: recipient_id,
            client_message_id: options.clientMessageId || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            reply_to_id: options.replyToId || null,
            expires_at: options.expiresAt || null,
            text: serializePayload(payload),
          })
         .select()
         .single();

        if (error) throw error;

        setMessages((prev) =>
          prev.some((m) => m.id === data.id)
            ? prev
            : [...prev, { ...data, plaintext: text.trim(), encrypted: true, decryptFailed: false }]
        );
        return { ok: true };
      } catch (err) {
        const msg = err.message || "Échec envoi";
        setSendError(msg);
        return { ok: false, error: msg };
      }
    },
    [conversation_id, current_user_id, recipient_id, keysReady, myPublicKeyJwk, fetchRecipientPublicKey]
  );

  return { messages, loading: loading ||!keysReady, sendMessage, sendError, keysReady };
}
