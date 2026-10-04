/**
 * BAARO AI Router — v2 (avec exclude pour fallback)
 */

const PROVIDERS = new Set([
  "n8n",
  "anthropic",
  "openai",
  "gemini",
  "moonshot",
  "xai",
]);

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

function configured(provider) {
  if (provider === "n8n") return Boolean(process.env.N8N_BAARO_WEBHOOK_URL);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "openai")
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_BASE);
  if (provider === "gemini")
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_BASE);
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
  const globalOrder = envOrder.length
    ? envOrder
    : ["n8n", "anthropic", "openai", "gemini", "moonshot", "xai"];

  const candidates = [...new Set([...regionOrder, ...globalOrder])].filter(
    (p) => !excludeSet.has(p)
  );

  return (
    candidates.find((p) => !configuredOnly || configured(p)) || null
  );
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
      base: process.env.GEMINI_API_BASE,
      model: process.env.GEMINI_MODEL || "",
    },
  };
  return configs[provider] || null;
}

export function publicRoutingInfo(country, requested) {
  const provider = chooseProvider({ country, requested });
  return { country: normalizeCountry(country), provider };
}
