const providers = [
  ["anthropic", ["ANTHROPIC_API_KEY"]],
  ["openai", ["OPENAI_API_KEY", "OPENAI_API_BASE", "OPENAI_MODEL"]],
  ["gemini", ["GEMINI_API_KEY", "GEMINI_API_BASE", "GEMINI_MODEL"]],
  ["moonshot", ["MOONSHOT_API_KEY", "MOONSHOT_API_BASE", "MOONSHOT_MODEL"]],
  ["xai", ["XAI_API_KEY", "XAI_API_BASE", "XAI_MODEL"]],
  ["n8n", ["N8N_BAARO_WEBHOOK_URL"]],
];
const enabled = providers.filter(([, keys]) => keys.every((k) => process.env[k])).map(([name]) => name);
console.log(`Configured BAARO AI providers: ${enabled.length ? enabled.join(', ') : 'none'}`);
if (!enabled.length) process.exitCode = 1;
