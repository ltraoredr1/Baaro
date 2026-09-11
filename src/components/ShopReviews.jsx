import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";

/**
 * Avis boutique
 * - Liste des avis publics
 * - Formulaire d'avis (uniquement si l'utilisateur a une commande "delivered" sans avis)
 * 100 % Supabase + RLS — aucun nouvel endpoint API.
 */
export default function ShopReviews({ shopId, userId }) {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [eligibleOrderId, setEligibleOrderId] = useState(null);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadReviews() {
    const { data, error } = await supabase
      .from("shop_reviews")
      .select("id, rating, comment, created_at, buyer_id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setReviews([]);
    } else {
      setReviews(data || []);
    }
  }

  async function checkCanReview() {
    if (!userId || !shopId) {
      setCanReview(false);
      return;
    }

    // Commandes livrées de cet acheteur pour cette boutique
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("shop_id", shopId)
      .eq("buyer_id", userId)
      .eq("status", "delivered");

    if (!orders || orders.length === 0) {
      setCanReview(false);
      return;
    }

    // Déjà un avis pour une de ces commandes ?
    const orderIds = orders.map((o) => o.id);
    const { data: existing } = await supabase
      .from("shop_reviews")
      .select("order_id")
      .in("order_id", orderIds);

    const reviewedIds = new Set((existing || []).map((r) => r.order_id));
    const eligible = orders.find((o) => !reviewedIds.has(o.id));

    if (eligible) {
      setCanReview(true);
      setEligibleOrderId(eligible.id);
    } else {
      setCanReview(false);
      setEligibleOrderId(null);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadReviews(), checkCanReview()]);
      setLoading(false);
    })();
  }, [shopId, userId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!eligibleOrderId || !userId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("shop_reviews").insert({
        shop_id: shopId,
        order_id: eligibleOrderId,
        buyer_id: userId,
        rating,
        comment: comment.trim() || null,
      });

      if (error) throw error;

      showToast("Merci pour ton avis !", "success");
      setComment("");
      setRating(5);
      setCanReview(false);
      setEligibleOrderId(null);
      await loadReviews();
    } catch (err) {
      showToast(err.message || "Erreur lors de l'envoi", "error");
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
      {/* Résumé */}
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

      {/* Formulaire */}
      {canReview && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{ background: COLORS.surface2, borderColor: COLORS.border }}
        >
          <p className="text-xs font-bold" style={{ color: COLORS.ivory }}>
            Donne ton avis
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-0.5"
              >
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
            {submitting ? "Envoi…" : "Publier l'avis"}
          </button>
        </form>
      )}

      {/* Liste */}
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
