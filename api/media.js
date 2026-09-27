import { applyCors, getAdminClient, requireUser, rateLimitAsync } from "./_shared.js";

const TELEGRAM_MEDIA_API_URL = String(process.env.TELEGRAM_MEDIA_API_URL || "").replace(/\/$/, "");
const TELEGRAM_API_SECRET = process.env.TELEGRAM_API_SECRET || "";
const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(["posts", "videos", "stories", "profiles", "shop", "chat"]);

function safeFolder(folder) {
  const value = String(folder || "posts").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return value || "posts";
}

function safeName(name) {
  return String(name || "file").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || "file";
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée" });

  try {
    const limit = await rateLimitAsync(req, { key: "telegram-media", max: 30, windowMs: 60000 });
    if (!limit.ok) {
      Object.entries(limit.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
      return res.status(limit.status).json(limit.body);
    }

    if (!TELEGRAM_MEDIA_API_URL || !TELEGRAM_API_SECRET) {
      throw new Error("Configuration Telegram média manquante");
    }

    const user = await requireUser(req, getAdminClient());
    const body = req.body || {};
    if (body.action !== "upload") return res.status(400).json({ ok: false, error: "Action invalide" });

    const size = Number(body.size || 0);
    const contentType = String(body.contentType || "application/octet-stream").trim();
    const folder = safeFolder(body.folder);
    const name = safeName(body.name);

    if (!ALLOWED_FOLDERS.has(folder)) return res.status(400).json({ ok: false, error: "Dossier média non autorisé" });
    if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) return res.status(413).json({ ok: false, error: "Fichier trop volumineux (max 50 Mo)" });

    const params = new URLSearchParams({ filename: name, contentType, folder, userId: user.id });
    const uploadUrl = `${TELEGRAM_MEDIA_API_URL}/api/upload?${params.toString()}&secret=${encodeURIComponent(TELEGRAM_API_SECRET)}`;

    return res.status(200).json({ ok: true, uploadUrl, expiresIn: 300, provider: "telegram" });
  } catch (error) {
    console.error("[media] Telegram:", error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || "Préparation média impossible" });
  }
}
