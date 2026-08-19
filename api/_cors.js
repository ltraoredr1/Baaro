/**
 * CORS partagé pour les routes /api/*
 *
 * En production : autorise uniquement ton domaine Vercel (+ localhost en dev).
 * Configure via variable d'environnement :
 *   ALLOWED_ORIGINS=https://ton-app.vercel.app,https://baaro.app
 *
 * Si non définie → seules les origines localhost de développement sont autorisées.
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

  // Sans ALLOWED_ORIGINS, seules les origines de développement sont autorisées.
  // Une API sensible ne doit jamais basculer automatiquement en wildcard.
  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // Requêtes serveur/clients natifs sans header Origin.
  } else {
    // Origine non autorisée : on n'expose pas de Allow-Origin
    res.setHeader("Vary", "Origin");
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
