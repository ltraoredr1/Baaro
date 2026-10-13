
import { useState, useEffect, useCallback } from "react";
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
 *  - user_id: current user id
 */
export function PollDisplay({
  postId,
  question,
  options = [],
  endsAt,
  user_id,
}) {
  const { showToast } = useToast();

  const optionList = Array.isArray(options) ? options : [];
  const optionCount = optionList.length;

  const [votes, setVotes] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [voting, setVoting] = useState(false);

  const totalVotes = votes.reduce(
    (sum, vote) => sum + vote.count,
    0
  );

  const parsedEndDate = endsAt ? new Date(endsAt) : null;
  const hasValidEndDate =
    parsedEndDate !== null &&
    !Number.isNaN(parsedEndDate.getTime());

  const isClosed =
    hasValidEndDate && parsedEndDate.getTime() <= Date.now();

  useEffect(() => {
    let cancelled = false;

    const loadVotes = async () => {
      setLoading(true);
      setLoadFailed(false);
      setVotes([]);
      setMyVote(null);

      if (!postId || optionCount === 0) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("post_poll_votes")
          .select("option_index, user_id")
          .eq("post_id", postId);

        if (error) throw error;
        if (cancelled) return;

        const counts = Array(optionCount).fill(0);
        let mine = null;

        for (const row of data || []) {
          const index = Number(row.option_index);

          // Ignore invalid indexes without changing the database.
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= optionCount
          ) {
            continue;
          }

          counts[index] += 1;

          if (user_id && row.user_id === user_id) {
            mine = index;
          }
        }

        setVotes(
          counts.map((count, index) => ({
            option_index: index,
            count,
          }))
        );

        setMyVote(mine);
      } catch (err) {
        if (cancelled) return;

        setLoadFailed(true);
        handleDbError(
          err,
          showToast,
          "Erreur chargement sondage"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadVotes();

    return () => {
      cancelled = true;
    };
  }, [postId, optionCount, user_id, showToast]);

  const handleVote = useCallback(
    async (optionIndex) => {
      if (!user_id) {
        showToast("Connecte-toi pour voter", "error");
        return;
      }

      if (!postId) {
        showToast("Sondage indisponible", "error");
        return;
      }

      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= optionCount
      ) {
        return;
      }

      if (
        loading ||
        loadFailed ||
        myVote !== null ||
        isClosed ||
        voting
      ) {
        return;
      }

      setVoting(true);

      // Optimistic update : affiche le vote immédiatement.
      setMyVote(optionIndex);
      setVotes((previousVotes) =>
        previousVotes.map((vote) =>
          vote.option_index === optionIndex
            ? { ...vote, count: vote.count + 1 }
            : vote
        )
      );

      try {
        const { error } = await supabase
          .from("post_poll_votes")
          .insert({
            post_id: postId,
            user_id,
            option_index: optionIndex,
          });

        if (error) throw error;
      } catch (err) {
        // Rollback si l'enregistrement échoue.
        setMyVote(null);
        setVotes((previousVotes) =>
          previousVotes.map((vote) =>
            vote.option_index === optionIndex
              ? {
                  ...vote,
                  count: Math.max(0, vote.count - 1),
                }
              : vote
          )
        );

        handleDbError(
          err,
          showToast,
          "Impossible de voter"
        );
      } finally {
        setVoting(false);
      }
    },
    [
      user_id,
      postId,
      optionCount,
      loading,
      loadFailed,
      myVote,
      isClosed,
      voting,
      showToast,
    ]
  );

  if (!question || optionCount === 0) {
    return null;
  }

  return (
    <div
      className="mt-3 p-3 rounded-xl border space-y-2"
      style={{
        borderColor: COLORS.borderTeal,
        background: COLORS.surface,
      }}
    >
      <p
        className="text-sm font-semibold"
        style={{ color: COLORS.ivory }}
      >
        {question}
      </p>

      {loading ? (
        <p
          className="text-xs"
          style={{ color: COLORS.muted }}
          role="status"
        >
          Chargement...
        </p>
      ) : loadFailed ? (
        <p
          className="text-xs"
          style={{ color: COLORS.muted }}
          role="status"
        >
          Impossible de charger les votes.
        </p>
      ) : (
        <div className="space-y-1.5">
          {optionList.map((option, index) => {
            const count =
              votes.find(
                (vote) => vote.option_index === index
              )?.count || 0;

            const percentage =
              totalVotes > 0
                ? Math.round((count / totalVotes) * 100)
                : 0;

            const isSelected = myVote === index;
            const showResults =
              myVote !== null || isClosed;

            return (
              <button
                key={`${index}-${option}`}
                type="button"
                disabled={
                  loading ||
                  loadFailed ||
                  myVote !== null ||
                  isClosed ||
                  voting
                }
                onClick={() => handleVote(index)}
                className="w-full relative overflow-hidden rounded-lg border text-left px-3 py-2 text-sm transition disabled:cursor-default"
                style={{
                  borderColor: isSelected
                    ? COLORS.teal
                    : COLORS.border,
                  background: COLORS.surface2,
                  color: COLORS.ivory,
                }}
                aria-pressed={isSelected}
              >
                {showResults && (
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none"
                    style={{
                      width: `${percentage}%`,
                      background: isSelected
                        ? "rgba(45, 191, 166, 0.25)"
                        : "rgba(255,255,255,0.06)",
                    }}
                    aria-hidden="true"
                  />
                )}

                <div className="relative flex items-center justify-between gap-2">
                  <span
                    className={
                      isSelected ? "font-semibold" : ""
                    }
                  >
                    {option}
                    {isSelected ? " ✓" : ""}
                  </span>

                  {showResults && (
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: COLORS.muted }}
                    >
                      {percentage}% · {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p
        className="text-[10px]"
        style={{ color: COLORS.muted }}
      >
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        {isClosed ? " · Terminé" : ""}
        {endsAt && !isClosed && hasValidEndDate
          ? ` · Fin le ${parsedEndDate.toLocaleDateString("fr-FR")}`
          : ""}
      </p>
    </div>
  );
}
