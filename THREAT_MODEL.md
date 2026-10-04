# BAARO Threat Model — Production Baseline

## Scope

This document defines the security assumptions and mitigations for the BAARO web/PWA product using Supabase, Vercel, Cloudflare R2, and the external media worker.

It is a practical baseline, not a claim of perfect security. A production launch still requires dependency review, RLS tests, provider configuration checks, and an independent penetration test.

## Assets to protect

- Account credentials, sessions and MFA factors.
- E2E private keys and device identity keys.
- E2E message ciphertext and conversation metadata.
- Private media and signed R2 URLs.
- Profiles, contacts, communities and moderation data.
- Security events and operational logs.
- Server secrets: Supabase service key, R2 credentials, worker secret, Upstash credentials and third-party API keys.

## Trust boundaries

1. **Browser / Android WebView → Vercel**: untrusted client. Never trust IDs, roles, prices, permissions or counters supplied by the client.
2. **Vercel → Supabase**: privileged server boundary. Service credentials stay server-side.
3. **Vercel / worker → R2**: server-to-storage boundary. Prefer private buckets and short-lived signed URLs.
4. **Device → device E2E**: cryptographic trust is established by device keys and explicit verification, not by the server.
5. **Operators / insiders**: assume an administrator may see operational metadata, but must not receive E2E private keys or plaintext messages through normal server access.

## Threats and controls

### XSS / malicious HTML / script injection

**Threat:** attacker injects JavaScript through profiles, posts, messages, captions, search parameters or third-party content.

**Controls:** restrictive CSP; no `unsafe-eval`; React escaping; server-side validation; no arbitrary HTML rendering; dependency/secret scans; avoid inserting untrusted HTML with `dangerouslySetInnerHTML`.

**Residual risk:** a compromised dependency or future CSP regression can still become critical. Test CSP in every production deployment.

### Device lost or stolen

**Threat:** attacker gains physical access to a logged-in phone/browser and tries to access sessions or E2E keys.

**Controls:** device registry; session revocation; device removal; OS-level screen lock/biometrics where available; device-bound E2E keys; key rotation after compromise; encrypted local key storage.

**Recovery rule:** a new device should require an approved existing device or the user's E2E recovery mechanism. BAARO must not silently create a server-readable replacement key.

### Man-in-the-middle

**Threat:** interception between client and BAARO/provider endpoints.

**Controls:** HTTPS-only transport; HSTS preload policy; secure provider endpoints; certificate validation by platform; E2E encryption for message content.

**Residual risk:** TLS compromise or a compromised device can defeat transport protection; E2E does not protect a fully compromised endpoint.

### Insider / privileged operator

**Threat:** employee or compromised service credential accesses user data.

**Controls:** least privilege; RLS; service-only writes for sensitive tables; separate environment secrets; audit/security events; no E2E private keys on the server; short-lived signed media URLs; secret rotation.

**Goal:** an insider may access operational metadata required to run BAARO, but should not be able to decrypt E2E message content.

### Account takeover / stolen session

**Threat:** attacker obtains credentials, refresh token or session through phishing, malware or browser compromise.

**Controls:** MFA for privileged accounts; session/device registry; revocation; rate limiting; Turnstile where appropriate; suspicious activity monitoring; secure cookies/token handling by Supabase Auth.

### Brute force / API abuse

**Threat:** attacker floods login, messaging, media, search or social endpoints.

**Controls:** Upstash Redis is mandatory for Vercel production rate limiting; limits are keyed server-side; bounded payloads; idempotency where needed; abuse counters.

**Deployment invariant:** production deployment must fail if `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is absent.

### CSRF / cross-site actions

**Threat:** malicious site triggers authenticated actions.

**Controls:** same-origin application routes; bearer-token APIs; restrictive CSP; CORS allow-list; server-side authentication/authorization on every sensitive endpoint.

### Media abuse / malicious files

**Threat:** attacker uploads oversized, malformed or malicious media.

**Controls:** upload size limits; R2/worker architecture for large media; signed upload/download paths; MIME/type validation; FFmpeg isolation in the worker; no unbounded media bodies in Vercel functions.

### Supabase / RLS bypass

**Threat:** client directly queries tables or invokes unsafe RPCs.

**Controls:** RLS; authenticated-only policies; owner checks; bounded RPC inputs; service-role-only server operations; security migration checks.

### Supply-chain compromise

**Threat:** malicious or vulnerable npm dependency compromises the client or worker.

**Controls:** lockfile; dependency audit; CI security scans; minimal dependency surface; no secrets in frontend bundles.

## Out of scope / explicit product decisions

- **Wallet and crypto features are removed from the product.** The coordinated Supabase migration decommissions their database surfaces.
- E2E messaging is intended to remain server-blind for message plaintext. Metadata such as account identifiers, timing, routing and device records may still exist server-side.

## Incident response

1. Revoke the affected secret/session/device immediately.
2. Preserve relevant security events without logging message plaintext or private keys.
3. Rotate credentials and invalidate affected sessions.
4. Assess whether E2E keys, account credentials, media URLs or provider credentials were exposed.
5. Patch the vulnerable path and add a regression test.
6. Notify affected users when required by applicable law or contractual obligations.

## Production verification checklist

- [ ] CSP observed in browser response headers.
- [ ] No CSP violations for normal feed, video, chat, calls and Turnstile flows.
- [ ] Upstash variables exist in Vercel Production.
- [ ] Production preflight fails when Upstash variables are removed.
- [ ] RLS tests pass for anonymous, normal and privileged users.
- [ ] Device revocation works from another trusted device.
- [ ] E2E recovery and lost-device flows have been tested.
- [ ] R2 buckets are private where appropriate.
- [ ] No secrets appear in `VITE_*` variables or client bundles.
- [ ] Independent penetration test completed before public launch.
