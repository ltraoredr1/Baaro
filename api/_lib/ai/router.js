/**
 * BAARO AI Router — v3
 *  - ajoute groq et mistral (compatibles OpenAI)
 *  - BAARO_AI_PROVIDER_ORDER passe avant les listes par pays
 *  - adresses de base par défaut pour gemini / groq / mistral
 *
 * Variables d'environnement (Vercel) :
 *   GEMINI_API_KEY  [GEMINI_API_BASE]  GEMINI_MODEL ou GEMINI_MODELS
 *   GROQ_API_KEY    [GROQ_API_BASE]    GROQ_MODEL   ou GROQ_MODELS
 *   MISTRAL_API_KEY [MISTRAL_API_BASE] MISTRAL_MODEL ou MISTRAL_MODELS
 *   BAARO_AI_PROVIDER_ORDER=gemini,groq,mistral,anthropic,n8n
 */

const PROVIDERS = new Set([
  "n8n",
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "mistral",
  "moonshot",
  "xai",
]);

const DEFAULT_BASES = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
};

const REGION_DEFAULTS = {
  CN: ["moonshot", "n8n", "anthropic"],
  US: ["openai", "xai", "anthropic", "n8n"],
  CA: ["openai", "anthropic", "n8n"],
  FR: ["anthropic", "openai", "n8n"],
  GB: ["anthropic", "openai", "n8n"],
  DE: ["anthropic", "openai", "n8n"],
  JP: ["openai", "anthropic", "n8n"],
  KR: ["openai", "anthropic", "n8n"],
  IN: ["openai", "gemini", "anthropic", "n8n"],
  BR: ["openai", "anthropic", "n8n"],
  NG: ["openai", "anthropic", "n8n"],
  ML: ["anthropic", "openai", "n8n"],
  SN: ["anthropic", "openai", "n8n"],
  CI: ["anthropic", "openai", "n8n"],
  BF: ["anthropic", "openai", "n8n"],
};

function csv(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function envOf(provider, suffix) {
  return process.env[provider.toUpperCase() + "_" + suffix];
}

function baseOf(provider) {
  return envOf(provider, "API_BASE") || DEFAULT_BASES[provider] || "";
}

// Un modèle doit être défini (MODEL ou MODELS), sinon l'appel échouerait sans message clair
function hasModel(provider) {
  return Boolean(envOf(provider, "MODEL") || envOf(provider, "MODELS"));
}

function configured(provider) {
  if (provider === "n8n") return Boolean(process.env.N8N_BAARO_WEBHOOK_URL);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "openai")
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_BASE);
  if (provider === "gemini")
    return Boolean(process.env.GEMINI_API_KEY && baseOf("gemini"));
  if (provider === "groq")
    return Boolean(process.env.GROQ_API_KEY && baseOf("groq") && hasModel("groq"));
  if (provider === "mistral")
    return Boolean(
      process.env.MISTRAL_API_KEY && baseOf("mistral") && hasModel("mistral")
    );
  if (provider === "moonshot")
    return Boolean(
      process.env.MOONSHOT_API_KEY && process.env.MOONSHOT_API_BASE
    );
  if (provider === "xai")
    return Boolean(process.env.XAI_API_KEY && process.env.XAI_API_BASE);
  return false;
}

export function normalizeCountry(value) {
  const country = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

/**
 * @param {object} opts
 * @param {string|null} opts.country
 * @param {string} [opts.requested]
 * @param {boolean} [opts.configuredOnly=true]
 * @param {string[]} [opts.exclude=[]]  providers à ignorer (fallback)
 */
export function chooseProvider({
  country,
  requested,
  configuredOnly = true,
  exclude = [],
} = {}) {
  const excludeSet = new Set(
    (exclude || []).map((p) => String(p).toLowerCase())
  );

  const explicit = String(requested || "")
    .trim()
    .toLowerCase();
  if (
    explicit &&
    PROVIDERS.has(explicit) &&
    !excludeSet.has(explicit) &&
    (!configuredOnly || configured(explicit))
  ) {
    return explicit;
  }

  const envOrder = csv(process.env.BAARO_AI_PROVIDER_ORDER).filter((p) =>
    PROVIDERS.has(p)
  );
  const regionOrder = REGION_DEFAULTS[normalizeCountry(country)] || [];
  const globalOrder = [
    "n8n",
    "anthropic",
    "openai",
    "gemini",
    "groq",
    "mistral",
    "moonshot",
    "xai",
  ];

  // Si BAARO_AI_PROVIDER_ORDER est défini, il passe AVANT les listes par pays
  const ordered = envOrder.length
    ? [...envOrder, ...regionOrder, ...globalOrder]
    : [...regionOrder, ...globalOrder];

  const candidates = [...new Set(ordered)].filter((p) => !excludeSet.has(p));

  return candidates.find((p) => !configuredOnly || configured(p)) || null;
}

export function providerConfig(provider) {
  const configs = {
    openai: {
      key: process.env.OPENAI_API_KEY,
      base: process.env.OPENAI_API_BASE,
      model: process.env.OPENAI_MODEL || "",
    },
    moonshot: {
      key: process.env.MOONSHOT_API_KEY,
      base: process.env.MOONSHOT_API_BASE,
      model: process.env.MOONSHOT_MODEL || "",
    },
    xai: {
      key: process.env.XAI_API_KEY,
      base: process.env.XAI_API_BASE,
      model: process.env.XAI_MODEL || "",
    },
    gemini: {
      key: process.env.GEMINI_API_KEY,
      base: baseOf("gemini"),
      model: process.env.GEMINI_MODEL || "",
    },
    groq: {
      key: process.env.GROQ_API_KEY,
      base: baseOf("groq"),
      model: process.env.GROQ_MODEL || "",
    },
    mistral: {
      key: process.env.MISTRAL_API_KEY,
      base: baseOf("mistral"),
      model: process.env.MISTRAL_MODEL || "",
    },
  };
  return configs[provider] || null;
}

export function publicRoutingInfo(country, requested) {
  const provider = chooseProvider({ country, requested });
  return { country: normalizeCountry(country), provider };
}
