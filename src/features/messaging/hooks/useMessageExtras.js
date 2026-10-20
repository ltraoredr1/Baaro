/**
 * src/features/messaging/hooks/useMessageExtras.js
 * Réactions (temps réel), favoris et épingles d'une conversation.
 * S'appuie sur lib/chatFeatures.js ; n'altère pas useMessaging.
 *
 * Remarque : si une table (message_reactions / message_stars / message_pins) n'existe pas ou est protégée
 * par RLS, l'erreur est seulement journalisée : la messagerie continue de fonctionner sans cette fonction.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../../supabaseClient.js";
import {
  toggleMessageReaction,
  toggleMessageStar,
  toggleMessagePin,
  fetchConversationReactions,
  fetchMyStarredIds,
  fetchPinsFor,
} from "../lib/chatFeatures.js";

const isTmp = (id) => String(id || "").startsWith("tmp-");
const NOT_SENT = "Message pas encore envoyé";

export function useMessageExtras(conversation_id, user_id, messages) {
  const [rows, setRows] = useState([]); // réactions : { id, message_id, user_id, emoji }
  const [starred, setStarred] = useState(() => new Set());
  const [pins, setPins] = useState(() => new Map()); // message_id -> pinned_by

  const convRef = useRef(conversation_id);
  const rowsRef = useRef([]);
  const fetchedRef = useRef(new Set());
  convRef.current = conversation_id;
  rowsRef.current = rows;

  const loadReactions = useCallback(async () => {
    if (!conversation_id) return;
    const conv = conversation_id;
    try {
      const data = await fetchConversationReactions(conv);
      if (convRef.current === conv) setRows(data);
    } catch (e) {
      console.warn("[useMessageExtras] réactions:", e?.message || e);
    }
  }, [conversation_id]);

  // Réinitialisation + chargement + temps réel à chaque changement de conversation
  useEffect(() => {
    setRows([]);
    setStarred(new Set());
    setPins(new Map());
    fetchedRef.current = new Set();
    if (!conversation_id || !user_id) return;

    let cancelled = false;
    const upsertRow = ({ new: row }) => {
      if (cancelled || !row) return;
      setRows((prev) => [
        ...prev.filter((r) => r.id !== row.id && !(r.message_id === row.message_id && r.user_id === row.user_id)),
        row,
      ]);
    };

    const channel = supabase
      .channel(`reactions:${conversation_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversation_id}` },
        upsertRow
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversation_id}` },
        upsertRow
      )
      // Les suppressions ne sont pas filtrables par conversation : on retire simplement la ligne si on la connaît
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, ({ old }) => {
        if (cancelled || !old?.id) return;
        setRows((prev) => prev.filter((r) => r.id !== old.id));
      })
      .subscribe();

    loadReactions();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversation_id, user_id, loadReactions]);

  // Favoris et épingles : on ne les demande que pour les messages pas encore interrogés (par lots)
  const realIds = useMemo(
    () => (messages || []).map((m) => m.id).filter((id) => id && !isTmp(id)),
    [messages]
  );

  useEffect(() => {
    if (!conversation_id || !user_id) return;
    const fresh = realIds.filter((id) => !fetchedRef.current.has(id));
    if (!fresh.length) return;
    const conv = conversation_id;
    const timer = setTimeout(async () => {
      fresh.forEach((id) => fetchedRef.current.add(id));
      try {
        const [stars, pinRows] = await Promise.all([fetchMyStarredIds(user_id, fresh), fetchPinsFor(fresh)]);
        if (convRef.current !== conv) return;
        if (stars.length) setStarred((prev) => new Set([...prev, ...stars]));
        if (pinRows.length) {
          setPins((prev) => {
            const next = new Map(prev);
            pinRows.forEach((p) => next.set(p.message_id, p.pinned_by));
            return next;
          });
        }
      } catch (e) {
        fresh.forEach((id) => fetchedRef.current.delete(id)); // permettra un nouvel essai
        console.warn("[useMessageExtras] favoris/épingles:", e?.message || e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [realIds, conversation_id, user_id]);

  // { messageId -> [{ emoji, count, mine }] }
  const reactionsByMessage = useMemo(() => {
    const grouped = new Map();
    for (const r of rows) {
      let g = grouped.get(r.message_id);
      if (!g) grouped.set(r.message_id, (g = new Map()));
      const e = g.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      e.count += 1;
      if (r.user_id === user_id) e.mine = true;
      g.set(r.emoji, e);
    }
    const out = new Map();
    for (const [mid, g] of grouped) out.set(mid, [...g.values()].sort((a, b) => b.count - a.count));
    return out;
  }, [rows, user_id]);

  // Réaction optimiste : l'affichage change tout de suite, puis on aligne sur le serveur (ou on recharge si échec)
  const toggleReaction = useCallback(
    async (messageId, emoji) => {
      if (!messageId || isTmp(messageId)) return { ok: false, error: NOT_SENT };
      const before = rowsRef.current;
      const mine = before.find((r) => r.message_id === messageId && r.user_id === user_id);
      let next;
      if (mine && mine.emoji === emoji) next = before.filter((r) => r !== mine);
      else if (mine) next = before.map((r) => (r === mine ? { ...r, emoji } : r));
      else
        next = [
          ...before,
          { id: `tmp-${messageId}-${user_id}`, message_id: messageId, conversation_id, user_id, emoji },
        ];
      setRows(next);
      try {
        const saved = await toggleMessageReaction(messageId, user_id, emoji);
        setRows((prev) => {
          const cleaned = prev.filter((r) => !(r.message_id === messageId && r.user_id === user_id));
          return saved ? [...cleaned, saved] : cleaned;
        });
        return { ok: true };
      } catch (e) {
        loadReactions();
        return { ok: false, error: e?.message || "Réaction impossible" };
      }
    },
    [user_id, conversation_id, loadReactions]
  );

  const toggleStar = useCallback(
    async (messageId) => {
      if (!messageId || isTmp(messageId)) return { ok: false, error: NOT_SENT };
      try {
        const nowStarred = await toggleMessageStar(messageId, user_id);
        setStarred((prev) => {
          const next = new Set(prev);
          if (nowStarred) next.add(messageId);
          else next.delete(messageId);
          return next;
        });
        return { ok: true, starred: nowStarred };
      } catch (e) {
        return { ok: false, error: e?.message || "Favori impossible" };
      }
    },
    [user_id]
  );

  const togglePin = useCallback(
    async (messageId) => {
      if (!messageId || isTmp(messageId)) return { ok: false, error: NOT_SENT };
      try {
        const nowPinned = await toggleMessagePin(messageId, user_id);
        setPins((prev) => {
          const next = new Map(prev);
          if (nowPinned) next.set(messageId, user_id);
          else next.delete(messageId);
          return next;
        });
        return { ok: true, pinned: nowPinned };
      } catch (e) {
        return { ok: false, error: e?.message || "Épinglage impossible" };
      }
    },
    [user_id]
  );

  return { reactionsByMessage, starred, pins, toggleReaction, toggleStar, togglePin };
}
