/**
 * CORS partagé pour les routes /api/*
 *
 * En production : autorise uniquement ton domaine Vercel (+ localhost en dev).
 * Configure via variable d'environnement :
 *   ALLOWED_ORIGINS=https://ton-app.vercel.app,https://baaro.app
 *
 * Si non définie → comportement permissif (*) pour ne pas casser le dev local.
 */

const DEFAULT_ALLOWED = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...fromEnv])];
}

/**
 * Applique les headers CORS et gère OPTIONS.
 * @returns {boolean} true si la requête OPTIONS a déjà été répondue (à return early)
 */
export function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = getAllowedOrigins();

  // Mode permissif si aucune origine custom n'est configurée (dev)
  const permissive = !process.env.ALLOWED_ORIGINS;

  if (permissive || allowed.includes(origin) || allowed.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else if (allowed.length > 0) {
    // Origine non autorisée : on n'expose pas de Allow-Origin
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
