# BAARO 2.0 v20 — Production Global

## Production gates

### 1. Build
- `npm ci`
- `npm run check:lock`
- `npm run build`

### 2. Database
- staging migration rehearsal
- production backup
- migrations applied in order
- RLS verification
- Storage policies verification
- rollback plan

### 3. Secrets
- use provider secret managers
- never commit `.env`
- never expose service-role, Daily, Stripe or AI provider secrets to the browser

### 4. Observability
- error tracking
- API latency
- database errors
- storage failures
- push delivery
- AI provider latency/error/cost
- wallet ledger anomalies
- payout failures
- rate-limit events

### 5. Deployment
- staging -> canary -> production
- health check
- automatic rollback on elevated errors
- database migration gate before application rollout

### 6. Global readiness
- timezone-safe timestamps
- locale-aware formatting
- ISO country/currency codes
- translation coverage
- regional AI routing
- provider availability by country
- data-retention policies
- privacy/terms/consent
- accessibility
- CDN/media strategy

### 7. Android
- signed release
- Play App Signing
- privacy policy
- permission declarations
- crash reporting
- push notification tests
- offline/reconnect tests
- deep-link tests
- camera/microphone tests

## Important

v20 is a production foundation and release checklist. It is not a claim that
BAARO has already been deployed or certified for every country. Real deployment
requires environment-specific secrets, legal/compliance review, provider approval,
live E2E tests and monitoring.
