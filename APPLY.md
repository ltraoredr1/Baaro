# BAARO — Correctif CI (smoke) + déblocage deploy

## Problème
CI échoue : `FAIL: ShopRegistrationForm still has split typo`  
Le test `includes("locale.spli")` matche aussi le code correct `locale.split(...)`.  
Prod bloquée en **V1.9** (pas de Boutiques dans Plus).

## Installation
```bash
# depuis la racine du repo Baaro
cp chemin/baaro-fix-ci/scripts/check-e2e-smoke.mjs scripts/check-e2e-smoke.mjs
node scripts/check-e2e-smoke.mjs
git add scripts/check-e2e-smoke.mjs
git commit -m "fix(ci): smoke check split typo false positive (locale.split)"
git push origin main
```

## Après push
1. Actions GitHub → BAARO CI = vert
2. Vercel redéploie (ou Redeploy manuel)
3. App : badge **v2.0**, Plus → **Boutiques**, Fil → stories
