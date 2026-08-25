# BAARO 2.0 v13 — Regional AI Gateway

## Architecture

Frontend → `/api/chat` → BAARO AI Gateway → provider adapter → AI provider.

The frontend never receives provider API keys.

## Routing

Routing uses the authenticated user's `profiles.country`, then optional `x-baaro-country`, and finally the configured global order.

Examples:
- CN: Moonshot/Kimi when configured, then fallback providers.
- ML: Anthropic/OpenAI, then n8n.
- US: OpenAI/xAI, then fallback providers.

These are defaults, not hard-coded geopolitical requirements. Operators can override them with `BAARO_AI_PROVIDER_ORDER` or an explicit provider preference.

## Environment variables

Required only for providers you actually enable:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE`
- `GEMINI_MODEL`
- `MOONSHOT_API_KEY`
- `MOONSHOT_API_BASE`
- `MOONSHOT_MODEL`
- `XAI_API_KEY`
- `XAI_API_BASE`
- `XAI_MODEL`
- `N8N_BAARO_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `BAARO_AI_PROVIDER_ORDER=...`

Do not put any of these secrets in `VITE_*` variables.

## Supabase

Run migration `019_ai_routing_foundation.sql` after migration 018.

## Operational recommendations

Use explicit provider base URLs so BAARO can switch vendors without changing frontend code. Add per-provider quotas, latency/error metrics, regional data-residency policy, content safety policy, and a circuit breaker before enabling large-scale traffic.
