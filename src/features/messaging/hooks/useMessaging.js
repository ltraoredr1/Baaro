/**
 * Hook de messagerie avec chiffrement E2E
 * - Charge les 150 plus RÉCENTS (desc + reverse) + pagination "messages précédents"
 * - Chiffre avant insert, déchiffre à la réception / au chargement (rétrocompatible texte clair)
 * - Envoi OPTIMISTE : le message apparaît tout de suite (pending), passe en "failed" si l'envoi échoue,
 *   et peut être renvoyé avec le même client_message_id (pas de doublon grâce à la contrainte unique)
 * - Réponse à un message (reply_to_id), suppression (deleted_at), indicateur "écrit…" (broadcast, sans table)
 * - Filtrage expires_at côté client
 * - Médias : pas de gros fichiers dans Supabase, media_url pointe vers R2
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

const PAGE_FIRST = 150;
const PAGE_OLDER = 50;
const TYPING_TTL_MS = 4000;
const TYPING_THROTTLE_MS = 2000;
const NO_RECIPIENT_KEY =
  "Ce contact n’a pas encore de clé publique. Il doit ouvrir BAARO une fois pour activer la messagerie sécurisée.";

const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at);
const isTmp = (id) => String(id || "").startsWith("tmp-");

function sameMessage(a, b) {
  return (
    (a.id && a.id === b.id) ||
    (a.client_message_id && a.client_message_id === b.client_message_id)
  );
}

// Fusionne des messages dans la liste (par id OU client_message_id) puis trie par date
function mergeMessages(list, incoming) {
  const next = list.slice();
  for (const msg of incoming) {
    const i = next.findIndex((m) => sameMessage(m, msg));
    if (i === -1) {
      next.push(msg);
    } else {
      const merged = { ...next[i], ...msg };
      // Un message venant du serveur n'est ni en attente ni en échec
      if (!("pending" in msg)) merged.pending = false;
      if (!("failed" in msg)) merged.failed = false;
      next[i] = merged;
    }
  }
  return next.sort(byDate);
}

export function useMessaging(conversation_id, current_user_id, recipient_id) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const {
    privateKey,
    publicKeyJwk: myPublicKeyJwk,
    ready: keysReady,
    error: keysError,
    fetchRecipientPublicKey,
  } = useCryptoKeys(current_user_id);

  const recipientKeyCache = useRef(null);
  const messagesRef = useRef([]);
  const conversationRef = useRef(conversation_id);
  const channelRef = useRef(null);
  const channelReadyRef = useRef(false);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  messagesRef.current = messages;
  conversationRef.current = conversation_id;

  // Reset si on change de conversation
  useEffect(() => {
    recipientKeyCache.current = null;
    clearTimeout(typingTimerRef.current);
    setMessages([]);
    setLoading(true);
    setLoadError(null);
    setHasMore(false);
    setOtherTyping(false);
  }, [conversation_id, recipient_id]);

  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const decryptOne = useCallback(
    async (rawMsg) => {
      try {
        // Messages expirés: masquer
        if (rawMsg.expires_at && new Date(rawMsg.expires_at) < new Date()) {
          return { ...rawMsg, plaintext: "[Message expiré]", encrypted: false, expired: true };
        }
        // Messages supprimés: pas de contenu
        if (rawMsg.deleted_at) {
          return { ...rawMsg, plaintext: "", encrypted: false };
        }
        // Messages média (image/video/voice/file) : pas de chiffrement texte, media_url est R2
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
      setLoadError(null);
      let { data, error } = await supabase
        .from("messages")
        .select("*, sender:sender_id(display_name, flag, avatar_url)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(PAGE_FIRST);

      if (error) {
        // Fallback sans jointure (si RLS bloque la relation)
        const plain = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(PAGE_FIRST);
        data = plain.data;
        error = plain.error;
      }

      if (cancelled) return;
      if (error) {
        setLoadError(error.message || "Chargement impossible");
        setLoading(false);
        return;
      }

      const ordered = (data || []).slice().reverse();
      const decrypted = await Promise.all(ordered.map(decryptOne));
      if (cancelled) return;
      setHasMore((data || []).length >= PAGE_FIRST);
      // Fusion (et non remplacement) : on garde ce qui est arrivé en temps réel pendant le chargement
      setMessages((prev) => mergeMessages(prev, decrypted.filter((m) => !m.expired)));
      setLoading(false);
    };

    // On s'abonne AVANT de charger : un message reçu pendant le chargement n'est plus perdu
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
          if (cancelled || decrypted.expired) return;
          if (decrypted.sender_id !== current_user_id) setOtherTyping(false);
          setMessages((prev) => mergeMessages(prev, [decrypted]));
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
          if (cancelled) return;
          if (decrypted.expired) {
            setMessages((prev) => prev.filter((m) => m.id !== decrypted.id));
          } else {
            setMessages((prev) => mergeMessages(prev, [decrypted]));
          }
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (cancelled || !payload || payload.user_id === current_user_id) return;
        setOtherTyping(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setOtherTyping(false), TYPING_TTL_MS);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channelReadyRef.current = true;
      });

    channelRef.current = channel;
    load();

    return () => {
      cancelled = true;
      channelReadyRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversation_id, current_user_id, keysReady, decryptOne]);

  // Signale "en train d'écrire" (limité à 1 envoi / 2 s)
  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !channelReadyRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    Promise.resolve(
      ch.send({ type: "broadcast", event: "typing", payload: { user_id: current_user_id } })
    ).catch(() => {});
  }, [current_user_id]);

  // Charge les messages plus anciens ; renvoie le nombre de messages ajoutés
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !conversation_id) return 0;
    const oldest = messagesRef.current.find((m) => !isTmp(m.id) && m.created_at);
    if (!oldest) return 0;
    const convAtStart = conversation_id;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_OLDER);
      if (error) throw error;
      const decrypted = await Promise.all((data || []).slice().reverse().map(decryptOne));
      if (conversationRef.current !== convAtStart) return 0; // on a changé de conversation entre-temps
      setMessages((prev) => mergeMessages(prev, decrypted.filter((m) => !m.expired)));
      setHasMore((data || []).length >= PAGE_OLDER);
      return decrypted.length;
    } catch (e) {
      console.warn("[useMessaging] loadOlder:", e);
      return 0;
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, conversation_id, decryptOne]);

  const markFailed = (clientId) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.client_message_id === clientId && isTmp(m.id) ? { ...m, pending: false, failed: true } : m
      )
    );

  /**
   * Envoie un message texte chiffré.
   * options: { clientMessageId, replyToId, expiresAt }
   * Pour RÉESSAYER un message en échec : repasser son client_message_id.
   */
  const sendMessage = useCallback(
    async (text, options = {}) => {
      const clean = text?.trim();
      if (!clean || !conversation_id || !current_user_id || !recipient_id) {
        return { ok: false, error: "Paramètres manquants" };
      }
      if (!keysReady) {
        return {
          ok: false,
          error: keysError || "Clés de chiffrement pas encore prêtes. Réessayez dans un instant.",
        };
      }
      setSendError(null);

      const clientId =
        options.clientMessageId ||
        (crypto?.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

      // Affichage immédiat (sauf si le vrai message est déjà présent, cas d'un renvoi après succès silencieux)
      const optimistic = {
        id: `tmp-${clientId}`,
        client_message_id: clientId,
        conversation_id,
        sender_id: current_user_id,
        recipient_id,
        type: "text",
        text: "",
        plaintext: clean,
        encrypted: true,
        decryptFailed: false,
        reply_to_id: options.replyToId || null,
        expires_at: options.expiresAt || null,
        created_at: new Date().toISOString(),
        pending: true,
        failed: false,
      };
      setMessages((prev) => {
        const existing = prev.find((m) => m.client_message_id === clientId);
        if (existing && !isTmp(existing.id)) return prev;
        return mergeMessages(prev, [optimistic]);
      });

      try {
        let recipientPub = recipientKeyCache.current;
        if (!recipientPub) {
          recipientPub = await fetchRecipientPublicKey(recipient_id);
          if (!recipientPub) throw new Error(NO_RECIPIENT_KEY);
          recipientKeyCache.current = recipientPub;
        }
        if (!myPublicKeyJwk) throw new Error("Clé locale manquante");

        const payload = await encryptMessage(clean, [
          { user_id: recipient_id, publicKeyJwk: recipientPub },
          { user_id: current_user_id, publicKeyJwk: myPublicKeyJwk },
        ]);

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
          // Doublon unique (conversation_id, client_message_id) : le message est déjà en base
          if (
            error.code === "23505" ||
            error.message?.includes("duplicate") ||
            error.message?.includes("unique")
          ) {
            setMessages((prev) =>
              prev.map((m) =>
                m.client_message_id === clientId ? { ...m, pending: false, failed: false } : m
              )
            );
            return { ok: true, data: { id: clientId, duplicate: true } };
          }
          throw error;
        }

        setMessages((prev) =>
          mergeMessages(prev, [
            {
              ...data,
              plaintext: clean,
              encrypted: true,
              decryptFailed: false,
              pending: false,
              failed: false,
            },
          ])
        );
        return { ok: true, data };
      } catch (err) {
        const msg = err?.message || "Échec envoi";
        setSendError(msg);
        markFailed(clientId);
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

  /**
   * Insère un message média / vocal / fichier (déjà uploadé sur R2) et l'AFFICHE IMMÉDIATEMENT,
   * sans attendre l'événement temps réel (le message est fusionné par client_message_id : pas de doublon).
   * fields : { text, type, media_url, media_mime, media_size, file_name, media_duration }
   * options : { clientMessageId, replyToId }
   */
  const sendMediaMessage = useCallback(
    async (fields, options = {}) => {
      if (!conversation_id || !current_user_id || !recipient_id) {
        return { ok: false, error: "Paramètres manquants" };
      }
      const clientId =
        options.clientMessageId ||
        (crypto?.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            conversation_id,
            sender_id: current_user_id,
            recipient_id,
            client_message_id: clientId,
            reply_to_id: options.replyToId || null,
            ...fields,
          })
          .select()
          .single();
        if (error) {
          if (
            error.code === "23505" ||
            error.message?.includes("duplicate") ||
            error.message?.includes("unique")
          ) {
            return { ok: true, data: { id: clientId, duplicate: true } };
          }
          throw error;
        }
        const full = await decryptOne(data);
        setMessages((prev) => mergeMessages(prev, [{ ...full, pending: false, failed: false }]));
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || "Échec envoi" };
      }
    },
    [conversation_id, current_user_id, recipient_id, decryptOne]
  );

  // Suppression "pour tous" de MES messages (marque deleted_at ; le contenu n'est plus affiché)
  const deleteMessage = useCallback(
    async (messageId) => {
      if (!messageId || isTmp(messageId)) return { ok: false, error: "Message pas encore envoyé" };
      const deleted_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("messages")
        .update({ deleted_at })
        .eq("id", messageId)
        .eq("sender_id", current_user_id)
        .select("id");
      if (error) return { ok: false, error: error.message || "Suppression impossible" };
      if (!data || data.length === 0) return { ok: false, error: "Suppression refusée" };
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deleted_at, plaintext: "" } : m))
      );
      return { ok: true };
    },
    [current_user_id]
  );

  return {
    messages,
    // Plus de spinner infini si les clés échouent : l'erreur est exposée via keysError
    loading: loading || (!keysReady && !keysError),
    sendMessage,
    sendMediaMessage,
    deleteMessage,
    loadOlder,
    hasMore,
    loadingOlder,
    notifyTyping,
    otherTyping,
    sendError,
    loadError,
    keysReady,
    keysError,
  };
}
