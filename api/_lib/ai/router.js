/**
 * BAARO AI Router v3.2 - Circuit Breaker + Routing Prioritaire
 * Priorité par défaut : Gemini -> Groq -> Mistral -> Anthropic -> OpenAI -> n8n
 */

const failures = new Map(); // provider → { count, openUntil }
const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
const FAILURE_THRESHOLD = 3;

export function isOpen(provider) {
  if (!provider) return false;
  const state = failures.get(provider);
  if (!state) return false;
  if (Date.now() > state.openUntil) {
    failures.delete(provider);
    return false;
  }
  return true;
}

export function recordFailure(provider, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!provider) return;
  const state = failures.get(provider) || { count: 0, openUntil: 0 };
  state.count += 1;
  if (state.count >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + cooldownMs;
  }
  failures.set(provider, state);
}

export function recordSuccess(provider) {
  if (!provider) return;
  failures.delete(provider);
}

export function openProviders() {
  const now = Date.now();
  const result = [];
  for (const [p, state] of failures) {
    if (now <= state.openUntil) result.push(p);
  }
  return result;
}

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
  CN: ["groq", "gemini", "moonshot", "n8n", "anthropic"],
  US: ["gemini", "groq", "mistral", "openai", "xai", "anthropic"],
  CA: ["gemini", "groq", "mistral", "openai", "anthropic"],
  FR: ["gemini", "groq", "mistral", "anthropic", "openai"],
  GB: ["gemini", "groq", "mistral", "anthropic", "openai"],
  DE: ["gemini", "groq", "mistral", "anthropic", "openai"],
  JP: ["gemini", "groq", "mistral", "openai", "anthropic"],
  KR: ["gemini", "groq", "mistral", "openai", "anthropic"],
  IN: ["gemini", "groq", "mistral", "openai", "anthropic"],
  BR: ["gemini", "groq", "mistral", "openai", "anthropic"],
  NG: ["gemini", "groq", "mistral", "anthropic", "openai"],
  ML: ["gemini", "groq", "mistral", "anthropic", "openai"],
  SN: ["gemini", "groq", "mistral", "anthropic", "openai"],
  CI: ["gemini", "groq", "mistral", "anthropic", "openai"],
  BF: ["gemini", "groq", "mistral", "anthropic", "openai"],
};

function csv(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function csvKeepCase(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function envOf(provider, suffix) {
  return process.env[provider.toUpperCase() + "_" + suffix];
}

function baseOf(provider) {
  return envOf(provider, "API_BASE") || DEFAULT_BASES[provider] || "";
}

function modelOf(provider) {
  const single = String(envOf(provider, "MODEL") || "").trim();
  if (single) return single;
  const list = csvKeepCase(envOf(provider, "MODELS"));
  return list[0] || "";
}

function hasModel(provider) {
  return Boolean(modelOf(provider));
}

function configured(provider) {
  if (provider === "n8n") return Boolean(process.env.N8N_BAARO_WEBHOOK_URL);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "openai")
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_BASE);
  if (provider === "gemini")
    return Boolean(process.env.GEMINI_API_KEY && baseOf("gemini") && hasModel("gemini"));
  if (provider === "groq")
    return Boolean(process.env.GROQ_API_KEY && baseOf("groq") && hasModel("groq"));
  if (provider === "mistral")
    return Boolean(process.env.MISTRAL_API_KEY && baseOf("mistral") && hasModel("mistral"));
  if (provider === "moonshot")
    return Boolean(process.env.MOONSHOT_API_KEY && process.env.MOONSHOT_API_BASE);
  if (provider === "xai")
    return Boolean(process.env.XAI_API_KEY && process.env.XAI_API_BASE);
  return false;
}

export function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function chooseProvider({
  country,
  requested,
  configuredOnly = true,
  exclude = [],
} = {}) {
  const excludeSet = new Set((exclude || []).map((p) => String(p).toLowerCase()));

  const explicit = String(requested || "").trim().toLowerCase();
  if (
    explicit &&
    PROVIDERS.has(explicit) &&
    !excludeSet.has(explicit) &&
    (!configuredOnly || configured(explicit)) &&
    !isOpen(explicit)
  ) {
    return explicit;
  }

  const envOrder = csv(process.env.BAARO_AI_PROVIDER_ORDER).filter((p) => PROVIDERS.has(p));
  const regionOrder = REGION_DEFAULTS[normalizeCountry(country)] || [];
  const globalOrder = [
    "gemini",
    "groq",
    "mistral",
    "anthropic",
    "openai",
    "n8n",
    "moonshot",
    "xai",
  ];

  const ordered = envOrder.length
    ? [...envOrder, ...regionOrder, ...globalOrder]
    : [...regionOrder, ...globalOrder];

  const candidates = [...new Set(ordered)].filter((p) => !excludeSet.has(p) && !isOpen(p));

  return candidates.find((p) => !configuredOnly || configured(p)) || null;
}

export function providerConfig(provider) {
  const configs = {
    openai: {
      key: process.env.OPENAI_API_KEY,
      base: process.env.OPENAI_API_BASE,
      model: modelOf("openai"),
    },
    moonshot: {
      key: process.env.MOONSHOT_API_KEY,
      base: process.env.MOONSHOT_API_BASE,
      model: modelOf("moonshot"),
    },
    xai: {
      key: process.env.XAI_API_KEY,
      base: process.env.XAI_API_BASE,
      model: modelOf("xai"),
    },
    gemini: {
      key: process.env.GEMINI_API_KEY,
      base: baseOf("gemini"),
      model: modelOf("gemini"),
    },
    groq: {
      key: process.env.GROQ_API_KEY,
      base: baseOf("groq"),
      model: modelOf("groq"),
    },
    mistral: {
      key: process.env.MISTRAL_API_KEY,
      base: baseOf("mistral"),
      model: modelOf("mistral"),
    },
  };
  return configs[provider] || null;
}
