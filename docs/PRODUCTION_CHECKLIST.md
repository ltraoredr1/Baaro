# BAARO — Production Checklist
Migrations are intentionally excluded from automated gates.
## Before every production deploy
- [ ] UPSTASH_REDIS_REST_URL + TOKEN present
- [ ] SUPABASE service role key server-only
- [ ] No secrets in VITE_* variables
- [ ] CSP headers visible
- [ ] Rate-limit returns 503 when Upstash removed
- [ ] RLS enabled and tested
- [ ] npm run ci passes
- [ ] Legal docs finalized
