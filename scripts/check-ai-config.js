// Fournisseurs réellement utilisés par /api/chat.
const providers = [
  ["lumen", ["LUMEN_API_KEY", "LUMEN_BASE_URL"]],
  ["groq", ["GROQ_API_KEY"]],
  ["mistral", ["MISTRAL_API_KEY"]],
  ["gemini", ["GEMINI_API_KEY"]],
];

const enabled = providers
  .filter(([, keys]) => keys.every((key) => String(process.env[key] || "").trim()))
  .map(([name]) => name);

console.log(
  `Configured BAARO AI providers: ${enabled.length ? enabled.join(", ") : "none"}`
);

if (process.env.BAARO_AI_PROVIDER_ORDER) {
  console.log(`Provider order: ${process.env.BAARO_AI_PROVIDER_ORDER}`);
}

if (!enabled.length) {
  console.error(
    "Configure LUMEN_API_KEY et LUMEN_BASE_URL, ou au moins une clé GROQ_API_KEY, MISTRAL_API_KEY ou GEMINI_API_KEY."
  );
  process.exitCode = 1;
}
