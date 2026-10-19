# Security Policy — BAARO

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (production / pre-production) | Yes |
| Other branches / forks | Best-effort only |

Security fixes are applied on `main` and, when relevant, backported to the current production release.

## Reporting a vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Please report security issues privately to:

- **Email:** security@baaro.app  
  (If this address is not yet active, use the repository owner’s verified contact via GitHub Security Advisories.)

Include as much of the following as possible:

1. Description of the issue and its impact  
2. Steps to reproduce (PoC if available)  
3. Affected component (web, Android, API, worker, Supabase policies, etc.)  
4. Your assessment of severity (Critical / High / Medium / Low)  
5. Any suggested remediation  

You should receive an acknowledgement within **72 hours**. We aim to provide a status update within **7 days**.

### Preferred channel (when available)

Once GitHub Security Advisories are enabled for this repository, prefer submitting a **private vulnerability report** via:

`https://github.com/ltraoredr1/Baaro/security/advisories/new`

## Scope

In scope:

- Authentication / session handling (Supabase Auth)  
- Row Level Security (RLS) bypasses  
- Exposure of secrets (`SUPABASE_SERVICE_ROLE_KEY`, R2 keys, payment keys, worker secrets)  
- XSS, CSRF, injection against the BAARO web/PWA or Android WebView  
- Broken access control on API routes (`api/*`)  
- Media pipeline abuse (R2 signed URLs, upload limits, MIME validation)  
- E2E messaging key handling (private keys must never leave the device)  
- Rate-limiting / abuse bypasses on production endpoints  

Out of scope (unless they lead to a high-impact issue above):

- Denial-of-service that only affects your own account  
- Social-engineering of end users  
- Issues in third-party services outside our configuration (Stripe, Daily, Cloudflare, etc.) when the misconfiguration is not on our side  
- Reports based solely on outdated dependencies without a working exploit path  

## Security principles (summary)

These principles are binding for contributors and operators. Full detail lives in `docs/THREAT_MODEL.md`.

1. **Never trust the client** — IDs, roles, prices, counters and permissions supplied by the browser are untrusted.  
2. **Secrets stay server-side** — no `VITE_*` variable may hold a service role key, R2 secret, payment secret or worker secret.  
3. **E2E private keys never leave the device** — the server must not receive or store message plaintext or private keys.  
4. **Production rate limiting is mandatory** — Upstash Redis must be configured; production must fail closed if it is absent.  
5. **RLS + controlled RPCs** — sensitive tables are protected by Row Level Security; privileged writes use the service role only on the server.  
6. **Short-lived signed media URLs** — prefer private R2 buckets and verified ownership on finalize.  
7. **Least privilege & audit** — rotate credentials on incident; log security events without plaintext or private keys.

## Incident response (high level)

1. Revoke the affected secret, session or device immediately.  
2. Preserve relevant security events (no message plaintext, no private keys).  
3. Rotate credentials and invalidate affected sessions.  
4. Assess exposure (E2E keys, credentials, media URLs, provider keys).  
5. Patch the path and add a regression check.  
6. Notify affected users when required by law or contract.

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction and service disruption  
- Report the vulnerability promptly and privately  
- Do not exploit the issue beyond what is necessary to demonstrate it  
- Do not disclose the issue publicly before we have had a reasonable time to remediate (coordinated disclosure)

## Related documents

- `docs/THREAT_MODEL.md` — production threat model and controls  
- `docs/PRIVACY_POLICY.md` — privacy policy (must be finalized before public launch)  
- `scripts/security-audit-scan.mjs` — static security markers scan  

Thank you for helping keep BAARO users safe.
