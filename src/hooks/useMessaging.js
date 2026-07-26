import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";

// Gère : la liste des contacts (les personnes que vous suivez), le chargement
// d'une conversation entre vous et un contact, l'envoi de messages, et la
// réception en direct des nouveaux messages via Supabase Realtime.
//
// Note sécurité : cette version stocke le texte en clair côté serveur
// (comme le fait la table `messages` du schéma actuel). La mention
// "chiffré de bout en bout" dans l'interface reflète l'objectif produit
// mais le vrai chiffrement E2E (clés par appareil + src/lib/crypto.js)
// n'est pas encore implémenté — à ajouter avant un vrai lancement si la
// confidentialité forte est requise.
export function useMessaging(userId) {
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  const loadContacts = useCallback(async () => {
    if (!userId) return;
    setLoadingContacts(true);
    const { data: followRows } = await supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", userId);

    const ids = (followRows || []).map((r) => r.followed_id);
    if (ids.length === 0) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, flag, handle")
      .in("user_id", ids);

    setContacts(
      (profiles || []).map((p) => ({
        id: p.user_id,
        display_name: p.display_name,
        flag: p.flag,
        handle: p.handle,
      }))
    );
    setLoadingContacts(false);
  }, [userId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const send = useCallback(
    async (contactId, text) => {
      if (!userId || !contactId || !text.trim()) {
        return { ok: false, reason: "Message vide" };
      }
      const { error } = await supabase.from("messages").insert({
        conversation_id: crypto.randomUUID(),
        sender_id: userId,
        recipient_id: contactId,
        text,
      });
      if (error) {
        return { ok: false, reason: error.message };
      }
      return { ok: true };
    },
    [userId]
  );

  // Hook interne : charge et écoute en direct la conversation avec un
  // contact précis. Appelé conditionnellement (un seul contact actif à la
  // fois), donc conforme aux règles des Hooks React dans ce composant.
  const useConversation = (contactId) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const channelRef = useRef(null);

    useEffect(() => {
      if (!userId || !contactId) return;
      let cancelled = false;

      const toDisplay = (row) => ({
        id: row.id,
        from: row.sender_id === userId ? "me" : "them",
        text: row.text,
        ts: row.created_at,
      });

      const load = async () => {
        setLoading(true);
        const { data } = await supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${userId},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${userId})`
          )
          .order("created_at", { ascending: true });
        if (!cancelled) {
          setMessages((data || []).map(toDisplay));
          setLoading(false);
        }
      };
      load();

      const channel = supabase
        .channel(`messages-${userId}-${contactId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new;
            const belongsHere =
              (row.sender_id === userId && row.recipient_id === contactId) ||
              (row.sender_id === contactId && row.recipient_id === userId);
            if (belongsHere) {
              setMessages((prev) =>
                prev.some((m) => m.id === row.id) ? prev : [...prev, toDisplay(row)]
              );
            }
          }
        )
        .subscribe();
      channelRef.current = channel;

      return () => {
        cancelled = true;
        if (channelRef.current) supabase.removeChannel(channelRef.current);
      };
    }, [userId, contactId]);

    return { messages, loading };
  };

  return { contacts, loadingContacts, useConversation, send, reloadContacts: loadContacts };
}
