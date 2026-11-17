# GitHub Actions — BAARO

## Workflows actifs

| Fichier | Déclencheur | Rôle |
|---------|-------------|------|
| `ci.yml` | push/PR `main`/`develop`, manuel | CI production complète (tests, WASM, build, Android) |
| `stories.yml` | chemins Stories + manuel | Tests module Stories/Statut + sync WASM |
| `install-dependencies.yml` | `package.json` / lockfile, manuel | Régénère et commit `package-lock.json` |
| `android-build.yml` | manuel (`workflow_dispatch`) | APK signé officiel |
| `publish.yml` | (voir fichier) | Publication mise à jour |
| `push-notifications-tests.yml` | chemins notifs | Tests push |
| `worker-rust.yml` | chemins `worker/` | Worker média Rust/C |
| `db-baseline.yml` | (voir fichier) | Baseline SQL |

## Hooks (déclencheurs)

- **Push** sur `main` / `develop` → CI (+ Stories si fichiers Stories touchés)
- **Pull request** vers `main` / `develop` → mêmes checks
- **workflow_dispatch** → relance manuelle depuis l’onglet Actions

## Secrets recommandés (Settings → Secrets and variables → Actions)

### Build Android (`android-build.yml`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

### CI / production (selon scripts `check:*`)
- secrets métier déjà documentés dans `scripts/check-secrets.mjs` et la doc production

Le job CI de build utilise des valeurs **factices** pour Vite (`example.supabase.co`) : pas besoin de secrets réels pour le step « Production build ».

## Protection de branche (à activer dans GitHub UI)

Settings → Branches → Branch protection rule sur `main` :

1. **Require a pull request before merging** (optionnel mais recommandé)
2. **Require status checks to pass before merging**
   - `Production Checks` (workflow CI)
   - `Stories tests + WASM` (si tu touches aux stories)
3. **Do not allow bypassing the above settings** pour les admins (selon politique)

## Termux / sans npm local

Les workflows tournent sur les runners GitHub. Depuis Termux tu peux seulement :

```bash
cd $HOME/Baaro
git pull origin main
# … commits …
git push origin main
# puis ouvrir https://github.com/ltraoredr1/Baaro/actions
```

Si le CI échoue sur **package-lock manquant** : Actions → « BAARO - Dependencies and lockfile » → Run workflow.

Si le CI échoue sur **WASM drift** (Stories ou Offline) : régénérer les binaires sur une machine avec Rust/Clang (`npm run test:stories` / `npm run test:offline`) et committer `public/wasm/*.wasm`.
