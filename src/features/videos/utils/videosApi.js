import { supabase } from "../../../supabaseClient.js";

export const isMissingColumn = (error) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column|schema cache/i.test(error.message || ""));

// Insère une vidéo ; si les colonnes son (migration 053) n'existent pas encore,
// on réessaie sans elles pour ne jamais bloquer la publication.
export const insertVideo = async (base, extra = {}) => {
  const hasExtra = Object.keys(extra).length > 0;
  let res = await supabase
    .from("videos")
    .insert({ ...base, ...extra })
    .select("id")
    .single();
  let degraded = false;
  if (res.error && hasExtra && isMissingColumn(res.error)) {
    res = await supabase.from("videos").insert(base).select("id").single();
    degraded = !res.error;
  }
  return { ...res, degraded };
};
