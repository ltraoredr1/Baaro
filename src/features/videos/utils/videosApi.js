import { supabase } from "../../../supabaseClient.js";

export const isMissingColumn = (error) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column|schema cache/i.test(error.message || ""));

/**
 * Insère une vidéo.
 * - retry sans colonnes son si absentes
 * - retry sans colonnes collab/engagement si absentes (migration pas encore appliquée)
 */
export const insertVideo = async (base, extra = {}) => {
  const hasExtra = Object.keys(extra).length > 0;
  let payload = { ...base, ...extra };
  let res = await supabase
    .from("videos")
    .insert(payload)
    .select("id")
    .single();
  let degraded = false;

  // Repli ciblé : préserver les colonnes audio déjà disponibles.
  if (res.error && hasExtra && isMissingColumn(res.error)) {
    const message = [
      res.error.message, res.error.details, res.error.hint,
    ].filter(Boolean).join(" ");

    let omitted = [];
    if (/sound_volume|original_volume/i.test(message)) {
      omitted = ["sound_volume", "original_volume"];
    } else if (/sound_artist|sound_license|sound_source_url/i.test(message)) {
      omitted = ["sound_artist", "sound_license", "sound_source_url"];
    } else {
      omitted = Object.keys(extra);
    }

    const safeExtra = { ...extra };
    omitted.forEach((key) => delete safeExtra[key]);
    if (Object.keys(safeExtra).length !== Object.keys(extra).length) {
      res = await supabase
        .from("videos")
        .insert({ ...base, ...safeExtra })
        .select("id")
        .single();
      degraded = !res.error;
    }
  }

  // Dernier repli historique : sans colonnes audio optionnelles.
  if (res.error && hasExtra && isMissingColumn(res.error)) {
    res = await supabase.from("videos").insert(base).select("id").single();
    degraded = !res.error;
  }

  // Colonnes collab / reply absentes : strip et réessaie
  if (res.error && isMissingColumn(res.error)) {
    const {
      collab_mode,
      source_video_id,
      reply_to_comment_id,
      reply_to_video_id,
      stitch_start_ms,
      stitch_end_ms,
      playlist_id,
      ...safe
    } = base;
    void collab_mode;
    void source_video_id;
    void reply_to_comment_id;
    void reply_to_video_id;
    void stitch_start_ms;
    void stitch_end_ms;
    void playlist_id;
    res = await supabase
      .from("videos")
      .insert(hasExtra ? { ...safe, ...extra } : safe)
      .select("id")
      .single();
    if (!res.error) degraded = true;
    // dernier recours : base sans extra ni collab
    if (res.error && hasExtra) {
      res = await supabase.from("videos").insert(safe).select("id").single();
      if (!res.error) degraded = true;
    }
  }

  return { ...res, degraded };
};
