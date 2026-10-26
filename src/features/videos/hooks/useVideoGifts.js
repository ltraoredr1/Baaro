import { useCallback, useEffect, useState } from "react";
import { createPayment } from "../../../lib/paymentProvider.js";
import { useToast } from "../../../components/ToastContext.jsx";
import {
  getCreatorTopGifters,
  listGiftCatalog,
  startGiftCheckout,
} from "../../../lib/videoEngagement.js";

/**
 * Cadeaux pendant la lecture.
 * - catalogue
 * - picker par vidéo
 * - animation overlay
 * - top donateurs créateur
 */
export function useVideoGifts({ user }) {
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState([]);
  const [pickerVideo, setPickerVideo] = useState(null);
  const [busyCode, setBusyCode] = useState(null);
  const [flyingGift, setFlyingGift] = useState(null);
  const [topGifters, setTopGifters] = useState([]);
  const [topForCreator, setTopForCreator] = useState(null);

  useEffect(() => {
    listGiftCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const openGiftPicker = (video) => {
    if (!user) {
      showToast("Connecte-toi pour offrir un cadeau.", "error");
      return;
    }
    if (!video?.id) return;
    const authorId = video.author_id || video.user_id;
    if (authorId && authorId === user.id) {
      showToast("Tu ne peux pas t'offrir un cadeau.", "info");
      return;
    }
    setPickerVideo(video);
  };

  const closeGiftPicker = () => setPickerVideo(null);

  const sendGift = useCallback(
    async (gift) => {
      if (!pickerVideo || !gift?.code || !user) return;
      const creatorId = pickerVideo.author_id || pickerVideo.user_id;
      setBusyCode(gift.code);

      try {
        const { intent, provider } = await startGiftCheckout({
          videoId: pickerVideo.id,
          giftCode: gift.code,
          creatorId,
        });

        // Affiche l'animation tout de suite (feedback UX) ;
        // le paiement réel est confirmé côté serveur.
        setFlyingGift({
          emoji: gift.emoji || "🎁",
          name: gift.name,
          animationKey: gift.animation_key || "sparkle",
          videoId: pickerVideo.id,
        });
        window.setTimeout(() => setFlyingGift(null), 2800);

        if (intent?.id) {
          const payment = await createPayment({
            provider: provider || "cinetpay",
            checkoutIntentId: intent.id,
          });
          if (payment?.payment_url) {
            window.location.href = payment.payment_url;
            return;
          }
        }

        // Si pas d'URL (dev / mock), on garde l'animation
        showToast(`${gift.emoji || "🎁"} ${gift.name} envoyé !`, "success");
        setPickerVideo(null);
      } catch (error) {
        console.error("[video-gift]", error);
        const msg = error?.message || "";
        if (msg.includes("PRODUCT_NOT_FOUND") || msg.includes("tip_custom")) {
          showToast(
            "Cadeau indisponible pour le moment. Les tips classiques restent actifs.",
            "error",
          );
        } else if (msg === "AUTH_REQUIRED") {
          showToast("Connecte-toi pour offrir un cadeau.", "error");
        } else {
          showToast("Impossible d'envoyer ce cadeau.", "error");
        }
      } finally {
        setBusyCode(null);
      }
    },
    [pickerVideo, user, showToast],
  );

  const loadTopGifters = useCallback(async (creatorId, days = 30) => {
    if (!creatorId) return;
    setTopForCreator(creatorId);
    try {
      const rows = await getCreatorTopGifters(creatorId, days, 15);
      setTopGifters(rows);
    } catch {
      setTopGifters([]);
    }
  }, []);

  const clearTopGifters = () => {
    setTopForCreator(null);
    setTopGifters([]);
  };

  return {
    catalog,
    pickerVideo,
    openGiftPicker,
    closeGiftPicker,
    sendGift,
    busyCode,
    flyingGift,
    topGifters,
    topForCreator,
    loadTopGifters,
    clearTopGifters,
  };
}
