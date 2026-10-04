import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { useToast } from "./ToastContext.jsx";

/**
 * Avis sur une entreprise (transport, radio, TV, etc.)
 *
 * Table dédiée légère (pas liée à une commande boutique).
 * Un utilisateur = un avis par entreprise (upsert).
 *
 * Migration minimale requise (voir en bas du fichier ou 025).
 * Toujours 0 nouvel endpoint API.
 */
export default function CompanyReviews({ companyId, userId }) {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState(null);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_reviews")
        .select("id, rating, comment, created_at, user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setReviews(data || []);

      if (userId) {
        const mine = (data || []).find((r) => r.user_id === userId);
        setMyReview(mine || null);
        if (mine) {
          setRating(mine.rating);
          setComment(mine.comment || "");
        }
      }
    } catch (err) {
      console.error(err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId) load();
  }, [companyId, userId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId) {
      showToast("Connecte-toi pour laisser un avis", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (myReview) {
        const { error } = await supabase
          .from("company_reviews")
          .update({
            rating,
            comment: comment.trim() || null,
          })
          .eq("id", myReview.id);
        if (error) throw error;
        showToast("Avis mis à jour", "success");
      } else {
        const { error } = await supabase.from("company_reviews").insert({
          company_id: companyId,
          user_id: userId,
          rating,
          comment: comment.trim() || null,
        });
        if (error) throw error;
        showToast("Merci pour ton avis !", "success");
      }
      await load();
    } catch (err) {
      showToast(err.message || "Erreur", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        Chargement des avis…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
          Avis
        </h3>
        {avg && (
          <span className="flex items-center gap-1 text-sm font-bold" style={{ color: COLORS.gold }}>
            <Star size={14} fill={COLORS.gold} />
            {avg}
            <span className="font-normal text-xs" style={{ color: COLORS.muted }}>
              ({reviews.length})
            </span>
          </span>
        )}
      </div>

      {/* Formulaire (création ou édition de mon avis) */}
      {userId && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{ background: COLORS.surface2, borderColor: COLORS.border }}
        >
          <p className="text-xs font-bold" style={{ color: COLORS.ivory }}>
            {myReview ? "Modifier mon avis" : "Laisser un avis"}
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} className="p-0.5">
                <Star
                  size={22}
                  fill={n <= rating ? COLORS.gold : "transparent"}
                  style={{ color: n <= rating ? COLORS.gold : COLORS.muted }}
                />
              </button>
            ))}
          </div>
          <textarea
            placeholder="Commentaire (optionnel)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              background: COLORS.surface3 || "rgba(0,0,0,0.2)",
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl py-2 text-sm font-bold disabled:opacity-50"
            style={{ background: COLORS.goldGlow, color: COLORS.gold }}
          >
            {submitting ? "Envoi…" : myReview ? "Mettre à jour" : "Publier"}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucun avis pour le moment.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border p-3"
              style={{ background: COLORS.surface2, borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={12}
                    fill={n <= r.rating ? COLORS.gold : "transparent"}
                    style={{ color: n <= r.rating ? COLORS.gold : COLORS.muted }}
                  />
                ))}
                <span className="text-[11px] ml-2" style={{ color: COLORS.muted }}>
                  {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  {r.user_id === userId ? " · (toi)" : ""}
                </span>
              </div>
              {r.comment && (
                <p className="text-xs" style={{ color: COLORS.ivory }}>
                  {r.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
