import { requireUser } from "./_supabaseAdmin.js";
import { applyCors } from "./_cors.js";
import { chooseProvider, normalizeCountry } from "./ai/router.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  let user;
  try { user = await requireUser(req); } catch (e) { return res.status(e.status || 401).json({ error: e.message }); }
  const country = normalizeCountry(req.query?.country || req.headers["x-baaro-country"]);
  const provider = chooseProvider({ country, requested: req.query?.provider });
  return res.status(200).json({ country, provider });
}
