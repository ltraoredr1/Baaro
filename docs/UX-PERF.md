# BAARO — Robustesse, performance, simplicité

## Objectifs

| Axe | Mesure |
|-----|--------|
| **Robuste** | Offline banner, retry réseau, ErrorBoundary, confirm dialogs |
| **Rapide** | Lazy media, chunks Vite, content-visibility, SW cache |
| **Facile** | Empty states clairs, cibles 44px, skip-link, reprise d’onglet |
| **Admirable** | Transitions sobres, contraste, PWA, focus clavier |

## Fichiers fournis

```
src/components/LazyMedia.jsx      # images/vidéos soft-fail
src/components/EmptyState.jsx     # « aucune donnée » unifié
src/components/ConfirmDialog.jsx  # remplacer window.confirm
src/components/OfflineBanner.jsx  # hors ligne
src/hooks/usePrefersReducedMotion.js
src/lib/perf.js                   # debounce, retry, last tab
vite.config.js                    # chunks icons + es2020
index.html                        # meta + skip-link + preconnect
src/index.css.additions.css       # a11y + touch + safe-area
```

## Application

```bash
cp baaro-patches/src/components/LazyMedia.jsx src/components/
cp baaro-patches/src/components/EmptyState.jsx src/components/
cp baaro-patches/src/components/ConfirmDialog.jsx src/components/
cp baaro-patches/src/components/OfflineBanner.jsx src/components/
cp baaro-patches/src/hooks/usePrefersReducedMotion.js src/hooks/
cp baaro-patches/src/lib/perf.js src/lib/
cp baaro-patches/vite.config.js .
cp baaro-patches/index.html .
# Coller index.css.additions.css à la fin de src/index.css
```

Puis appliquer les snippets `MainShell.perf.snippet.jsx`.

## Dans le Fil (exemple)

```jsx
import { LazyImage, LazyVideo } from "./LazyMedia.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

// Post image
<LazyImage src={post.avatar} alt="" className="w-10 h-10 rounded-full" />
<LazyImage src={post.media_url} alt="" className="w-full max-h-80" />

// Liste vide
{posts.length === 0 && (
  <EmptyState
    icon="✨"
    title="Aucune publication"
    description="Sois le premier à partager quelque chose."
    actionLabel="Écrire"
    onAction={() => document.querySelector("textarea")?.focus()}
  />
)}
```

## Confirm au lieu de window.confirm

```jsx
const [pendingDelete, setPendingDelete] = useState(null);

<ConfirmDialog
  open={!!pendingDelete}
  title="Supprimer ?"
  message="Cette action est définitive."
  danger
  confirmLabel="Supprimer"
  onCancel={() => setPendingDelete(null)}
  onConfirm={() => { handleDeletePost(pendingDelete); setPendingDelete(null); }}
/>
```

## Checklist « tout le monde »

- [ ] Textes en français simple (éviter le jargon)
- [ ] Boutons ≥ 44×44 px sur mobile
- [ ] Messages d’erreur actionnables (« Réessayer »)
- [ ] Fonctionne en 3G lente (lazy + retry)
- [ ] Mode sombre déjà par défaut (thème BAARO)
- [ ] Onboarding court déjà présent — ne pas le rallonger
- [ ] Guest peut explorer sans compte (GuestBanner)

## Prochaines étapes (optionnel)

1. Prefetch onglet au hover Navigation (`import()`)
2. Image CDN / transform Supabase Storage (`?width=800`)
3. Virtual list si > 200 posts en mémoire
4. Sentry pour ErrorBoundary production
EOF
