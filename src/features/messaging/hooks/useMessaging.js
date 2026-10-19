/**
 * Hook de messagerie avec chiffrement E2E — version corrigée complète
 * - Fix: charge les 150 plus RÉCENTS (desc + reverse)
 * - Chiffre avant insert
 * - Déchiffre à la réception / au chargement
 * - Rétrocompatible avec les anciens messages en clair
 * - Gestion plus robuste des erreurs de clés
 * - Support client_message_id pour éviter les doublons
 * - Filtrage expires_at côté client
 * - Respect: pas de gros fichiers dans Supabase, utilise R2 via media_url existant
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../supabaseClient.js";
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
    error: keysError,
    fetchRecipientPublicKey,
  } = useCryptoKeys(current_user_id);

  const recipientKeyCache = useRef(null);
  const seenIds = useRef(new Set());

  // Reset cache si on change de conversation
  useEffect(() => {
    recipientKeyCache.current = null;
    seenIds.current = new Set();
    setMessages([]);
    setLoading(true);
  }, [conversation_id, recipient_id]);

  const decryptOne = useCallback(
    async (rawMsg) => {
      try {
        // Messages expirés: masquer
        if (rawMsg.expires_at && new Date(rawMsg.expires_at) < new Date()) {
          return { ...rawMsg, plaintext: "[Message expiré]", encrypted: false, expired: true };
        }
        // Messages média (image/video/voice/file) : pas de chiffrement texte, media_url est R2 signé
        if (rawMsg.type && rawMsg.type !== "text" && rawMsg.media_url) {
          return {
            ...rawMsg,
            plaintext: rawMsg.text || rawMsg.file_name || "",
            encrypted: false,
          };
        }

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
        const plain = await decryptMessage(payload, privateKey, current_user_id);
        return {
          ...rawMsg,
          plaintext: plain ?? "[Impossible de déchiffrer]",
          encrypted: true,
          decryptFailed: !plain,
        };
      } catch {
        return { ...rawMsg, plaintext: rawMsg.text, encrypted: false };
      }
    },
    [privateKey, current_user_id]
  );

  useEffect(() => {
    if (!conversation_id || !current_user_id || !keysReady) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      // FIX P0: on charge les plus récents, pas les plus anciens
      let { data, error } = await supabase
        .from("messages")
        .select("*, sender:sender_id(display_name, flag, avatar_url)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) {
        // Fallback sans jointure (si RLS bloque la relation)
        const plain = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(150);
        data = plain.data;
        error = plain.error;
      }

      if (error || cancelled) {
        setLoading(false);
        return;
      }

      // reverse pour affichage chrono
      const ordered = (data || []).slice().reverse();
      const decrypted = await Promise.all(ordered.map(decryptOne));
      if (!cancelled) {
        decrypted.forEach((m) => seenIds.current.add(m.id));
        setMessages(decrypted.filter(m => !m.expired));
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
          if (seenIds.current.has(payload.new.id)) return;
          const decrypted = await decryptOne(payload.new);
          if (!cancelled && !decrypted.expired) {
            seenIds.current.add(decrypted.id);
            setMessages((prev) =>
              prev.some((m) => m.id === decrypted.id) ? prev : [...prev, decrypted]
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation_id}`,
        },
        async (payload) => {
          const decrypted = await decryptOne(payload.new);
          if (!cancelled) {
            if (decrypted.expired) {
              setMessages((prev) => prev.filter(m => m.id !== decrypted.id));
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === decrypted.id ? { ...m, ...decrypted } : m))
              );
            }
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
      if (!text?.trim() || !conversation_id || !current_user_id || !recipient_id) {
        return { ok: false, error: "Paramètres manquants" };
      }
      if (!keysReady) {
        return {
          ok: false,
          error: keysError || "Clés de chiffrement pas encore prêtes. Réessayez dans un instant.",
        };
      }
      setSendError(null);

      try {
        let recipientPub = recipientKeyCache.current;
        if (!recipientPub) {
          recipientPub = await fetchRecipientPublicKey(recipient_id);
          if (!recipientPub) {
            const err =
              "Ce contact n’a pas encore de clé publique. Il doit ouvrir BAARO une fois pour activer la messagerie sécurisée.";
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

        const clientId =
          options.clientMessageId ||
          (crypto?.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

        const { data, error } = await supabase
          .from("messages")
          .insert({
            conversation_id,
            sender_id: current_user_id,
            recipient_id,
            client_message_id: clientId,
            reply_to_id: options.replyToId || null,
            expires_at: options.expiresAt || null,
            text: serializePayload(payload),
            type: "text",
          })
          .select()
          .single();

        if (error) {
          // Gestion doublon unique (conversation_id, client_message_id)
          if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
            return { ok: true, data: { id: clientId, duplicate: true } };
          }
          throw error;
        }

        seenIds.current.add(data.id);
        setMessages((prev) =>
          prev.some((m) => m.id === data.id)
            ? prev
            : [
                ...prev,
                {
                  ...data,
                  plaintext: text.trim(),
                  encrypted: true,
                  decryptFailed: false,
                },
              ]
        );
        return { ok: true, data };
      } catch (err) {
        const msg = err.message || "Échec envoi";
        setSendError(msg);
        return { ok: false, error: msg };
      }
    },
    [
      conversation_id,
      current_user_id,
      recipient_id,
      keysReady,
      keysError,
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
    keysError,
  };
}
