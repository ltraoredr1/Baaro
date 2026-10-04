# BAARO Security Model

BAARO uses defense-in-depth. No software can honestly guarantee absolute security; this document defines the controls required for a high-security production deployment.

## Layers

1. **Identity** — Supabase Auth, strong passwords, MFA for privileged/financial roles, session revocation and device registry.
2. **Authorization** — PostgreSQL RLS, owner-scoped policies, server-only tables and least-privilege service credentials.
3. **Transport** — HTTPS, HSTS, secure CORS allow-list and restrictive browser security headers.
4. **Messaging** — E2E encryption with device-bound private keys. Key rotation and device verification are required before treating a conversation as strongly authenticated.
5. **Abuse prevention** — rate limits, Turnstile where appropriate, idempotency keys, fraud/risk signals and server-side validation.
6. **Secrets** — no server secret is permitted in `VITE_*` variables or source control. Use Vercel/Cloud Run secret stores.
7. **Media** — large files use R2/worker paths; API functions should not receive unbounded media bodies.
8. **AI** — sensitive actions require explicit confirmation; prompts and private content must not be logged as plaintext telemetry.
9. **Observability** — logs are structured and must be redacted; security events are server-controlled.
10. **Recovery** — encrypted backups, tested restoration, key rotation and incident-response procedures are mandatory.

## Production requirements

- Enable MFA for administrators, finance and support accounts.
- Use separate Supabase, R2, Stripe and AI credentials per environment.
- Rotate secrets after any suspected exposure.
- Restrict Cloud Run service accounts to the minimum required R2/Supabase permissions.
- Keep R2 buckets private when possible and issue short-lived signed URLs.
- Never trust client-provided user IDs, roles, prices, payout amounts or moderation decisions.
- Test RLS policies against anonymous, normal-user and privileged scenarios.
- Run dependency and secret scans on every pull request.
- Maintain a tested backup and disaster-recovery procedure.

## Incident response

If a secret is exposed: revoke it immediately, issue a replacement, invalidate affected sessions/tokens, inspect audit logs, and document the incident. Do not merely delete the secret from Git history.
