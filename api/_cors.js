/**
 * CORS partagé pour les routes /api/*
 *
 * Production : uniquement les origines listées dans ALLOWED_ORIGINS.
 * Dev : localhost autorisé par défaut.
 * Origine interdite en prod → 403 explicite.
 */

const DEFAULT_ALLOWED = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...fromEnv])];
}

function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Applique les headers CORS et gère OPTIONS.
 * @returns {boolean} true si la requête a déjà été répondue (OPTIONS ou 403)
 */
export function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = getAllowedOrigins();

  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin && isProduction()) {
    // Origine non autorisée en production → refus explicite
    res.setHeader("Vary", "Origin");
    res.status(403).json({ error: "Origin not allowed" });
    return true;
  } else if (!origin) {
    // Requêtes serveur / clients natifs sans header Origin
  } else {
    // Dev : origine inconnue → pas d'Allow-Origin
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id, X-BAARO-Country"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
