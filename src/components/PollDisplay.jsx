import { useState, useEffect } from "react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { useToast } from "./ToastContext.jsx";

/**
 * Affiche un sondage et gère le vote.
 * props:
 *  - postId
 *  - question
 *  - options: string[]
 *  - endsAt: string | null
 *  - userId: current user id
 */
export function PollDisplay({ postId, question, options = [], endsAt, userId }) {
  const { showToast } = useToast();
  const [votes, setVotes] = useState([]); // [{ option_index, count }]
  const [myVote, setMyVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const totalVotes = votes.reduce((s, v) => s + v.count, 0);
  const isClosed = endsAt ? new Date(endsAt) < new Date() : false;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("post_poll_votes")
          .select("option_index, user_id")
          .eq("post_id", postId);

        if (error) throw error;
        if (cancelled) return;

        const counts = {};
        options.forEach((_, i) => (counts[i] = 0));
        let mine = null;

        (data || []).forEach((row) => {
          counts[row.option_index] = (counts[row.option_index] || 0) + 1;
          if (userId && row.user_id === userId) mine = row.option_index;
        });

        setVotes(
          options.map((_, i) => ({ option_index: i, count: counts[i] || 0 }))
        );
        setMyVote(mine);
      } catch (err) {
        handleDbError(err, showToast, "Erreur chargement sondage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [postId, options, userId, showToast]);

  const handleVote = async (optionIndex) => {
    if (!userId) {
      showToast("Connecte-toi pour voter", "error");
      return;
    }
    if (myVote !== null || isClosed || voting) return;

    setVoting(true);
    // Optimistic
    setMyVote(optionIndex);
    setVotes((prev) =>
      prev.map((v) =>
        v.option_index === optionIndex ? { ...v, count: v.count + 1 } : v
      )
    );

    try {
      const { error } = await supabase.from("post_poll_votes").insert({
        post_id: postId,
        user_id: userId,
        option_index: optionIndex,
      });
      if (error) throw error;
    } catch (err) {
      // Rollback
      setMyVote(null);
      setVotes((prev) =>
        prev.map((v) =>
          v.option_index === optionIndex
            ? { ...v, count: Math.max(0, v.count - 1) }
            : v
        )
      );
      handleDbError(err, showToast, "Impossible de voter");
    } finally {
      setVoting(false);
    }
  };

  if (!question || !options.length) return null;

  return (
    <div
      className="mt-3 p-3 rounded-xl border space-y-2"
      style={{ borderColor: COLORS.borderTeal, background: COLORS.surface }}
    >
      <p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
        {question}
      </p>

      {loading ? (
        <p className="text-xs" style={{ color: COLORS.muted }}>Chargement...</p>
      ) : (
        <div className="space-y-1.5">
          {options.map((opt, i) => {
            const count = votes.find((v) => v.option_index === i)?.count || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isSelected = myVote === i;
            const showResults = myVote !== null || isClosed;

            return (
              <button
                key={i}
                type="button"
                disabled={myVote !== null || isClosed || voting}
                onClick={() => handleVote(i)}
                className="w-full relative overflow-hidden rounded-lg border text-left px-3 py-2 text-sm transition disabled:cursor-default"
                style={{
                  borderColor: isSelected ? COLORS.teal : COLORS.border,
                  background: COLORS.surface2,
                  color: COLORS.ivory,
                }}
              >
                {/* Barre de progression */}
                {showResults && (
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: isSelected
                        ? "rgba(45, 191, 166, 0.25)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <span className={isSelected ? "font-semibold" : ""}>
                    {opt}
                    {isSelected && " ✓"}
                  </span>
                  {showResults && (
                    <span className="text-xs tabular-nums" style={{ color: COLORS.muted }}>
                      {pct}% · {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[10px]" style={{ color: COLORS.muted }}>
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        {isClosed ? " · Terminé" : ""}
        {endsAt && !isClosed
          ? ` · Fin le ${new Date(endsAt).toLocaleDateString("fr-FR")}`
          : ""}
      </p>
    </div>
  );
}
