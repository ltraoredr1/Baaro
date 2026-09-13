# BAARO — Étape 4 : UX / Performance / Accessibilité

## État actuel (déjà en place ✅)

| Composant / utilitaire | Fichier | Intégré ? |
|------------------------|---------|-----------|
| `LazyImage` / `LazyVideo` | `src/components/LazyMedia.jsx` | Oui (composant prêt) |
| `EmptyState` | `src/components/EmptyState.jsx` | Oui |
| `ConfirmDialog` | `src/components/ConfirmDialog.jsx` | Oui |
| `OfflineBanner` | `src/components/OfflineBanner.jsx` | Oui — monté dans `MainShell` |
| `ErrorBoundary` | `src/components/ErrorBoundary.jsx` | Oui — autour des onglets |
| `usePrefersReducedMotion` | `src/hooks/usePrefersReducedMotion.js` | Oui |
| `perf.js` (debounce, retry, last tab) | `src/lib/perf.js` | Oui — `saveLastTab` / `loadLastTab` dans MainShell |
| Skip-link | `index.html` | Oui |
| Vite manualChunks | `vite.config.js` | Oui (daily, charts, supabase, icons…) |
| CSS a11y + reduced motion | `src/index.css` | Oui |

**Conclusion** : les briques sont là. L’étape 4 consiste à **généraliser leur usage** et à peaufiner les détails UX.

---

## 1. Checklist d’intégration (à faire écran par écran)

### A. Remplacer les listes vides par `EmptyState`

| Écran | Condition vide | Proposition |
|-------|----------------|-------------|
| Fil (feed) | `posts.length === 0` | icon ✨ — « Aucune publication » — action « Écrire » |
| Messages | aucune conversation | icon 💬 — « Aucun message » |
| Commandes acheteur | `orders.length === 0` | icon 🛒 — « Aucune commande » |
| Commandes vendeur | idem | icon 📦 — « Aucune commande reçue » |
| Boutiques | annuaire vide | icon 🏪 — « Aucune boutique » |
| Entreprises | liste vide | icon 🏢 — « Aucune entreprise » |
| Débats | aucun débat | icon 🎙️ — « Aucun débat en cours » |
| Recherche | 0 résultat | icon 🔍 — « Aucun résultat » |

**Snippet type :**
```jsx
import { EmptyState } from "../components/EmptyState.jsx";

{items.length === 0 && !loading && (
  <EmptyState
    icon="✨"
    title="Aucune publication"
    description="Sois le premier à partager quelque chose."
    actionLabel="Écrire"
    onAction={() => focusComposer()}
  />
)}
```

### B. Remplacer les `<img>` / `<video>` bruts par `LazyImage` / `LazyVideo`

Priorité haute :
- Cartes de posts (feed)
- Avatars (partout)
- Produits boutique (`ProductCard`, `ShopDetail`)
- Logos entreprises (`CompanyCard`)
- Stories / médias live

```jsx
import { LazyImage, LazyVideo } from "../components/LazyMedia.jsx";

<LazyImage src={post.media_url} alt="" variant="feed" className="w-full max-h-80" />
<LazyImage src={user.avatar_url} alt="" variant="avatar" className="w-10 h-10 rounded-full" />
<LazyVideo src={videoUrl} className="w-full rounded-xl" />
```

### C. Remplacer `window.confirm` par `ConfirmDialog`

Cherche dans le code :
```bash
grep -rn "window.confirm\|confirm(" src/ --include="*.jsx" --include="*.js"
```

Remplace chaque occurrence par un état `pendingXxx` + `<ConfirmDialog ... />`.

### D. Boutons / cibles tactiles ≥ 44×44 px

Dans les listes denses (Navigation, Header, cartes) :
- `min-h-[44px] min-w-[44px]` ou `p-3` minimum
- Zones de like / commentaire / partage : zone cliquable large

### E. Messages d’erreur actionnables

Préférer :
```jsx
<button onClick={retry}>Réessayer</button>
```
plutôt qu’un simple « Erreur réseau ».

Utiliser `withRetry` de `src/lib/perf.js` pour les appels réseau critiques.

---

## 2. CSS utilitaires à ajouter (si absents)

Ajoute à la **fin** de `src/index.css` :

```css
/* ============================================================
   UX-PERF — utilitaires complémentaires
   ============================================================ */

/* Skip-link (déjà dans index.html) */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 9999;
  padding: 0.75rem 1.25rem;
  background: #d9ae52;
  color: #0b1220;
  font-weight: 700;
  border-radius: 0 0 0.5rem 0;
}
.skip-link:focus {
  left: 0;
}

/* content-visibility pour longs feeds */
.baaro-feed-item {
  content-visibility: auto;
  contain-intrinsic-size: 1px 320px;
}

/* Cibles tactiles confortables */
.baaro-tap {
  min-height: 44px;
  min-width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Safe area (notch / home indicator) */
.baaro-safe-bottom {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}
.baaro-safe-top {
  padding-top: max(0.5rem, env(safe-area-inset-top));
}

/* Skeleton léger */
.baaro-skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 75%
  );
  background-size: 200% 100%;
  animation: baaro-shimmer 1.2s ease-in-out infinite;
}
@keyframes baaro-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .baaro-skeleton { animation: none; }
}
```

---

## 3. Prefetch d’onglets (optionnel mais recommandé)

`src/lib/prefetchTab.js` existe déjà. Sur le hover / focus de la Navigation :

```jsx
import { prefetchTab } from "../lib/prefetchTab.js";

<button
  onMouseEnter={() => prefetchTab("messages")}
  onFocus={() => prefetchTab("messages")}
  ...
>
```

Cela charge le chunk de l’onglet avant le clic → navigation plus fluide.

---

## 4. Checklist « tout le monde » (validation manuelle)

- [ ] Textes en français simple (pas de jargon technique)
- [ ] Boutons ≥ 44×44 px sur mobile
- [ ] Messages d’erreur avec bouton « Réessayer »
- [ ] Test 3G lente (Chrome DevTools) : images lazy, pas de layout shift majeur
- [ ] Mode sombre par défaut (déjà le cas)
- [ ] Guest peut explorer (GuestBanner présent)
- [ ] OfflineBanner apparaît quand on coupe le réseau
- [ ] ConfirmDialog au lieu de `window.confirm` pour suppressions
- [ ] EmptyState sur toutes les listes vides principales
- [ ] Skip-link visible au focus clavier
- [ ] Reduced motion respecté (OS + toggle réglages)

---

## 5. Tests rapides à faire

1. **Offline** : DevTools → Network → Offline → le bandeau rouge doit apparaître.
2. **Empty** : compte neuf → feed / messages / commandes affichent un EmptyState clair.
3. **Image cassée** : URL invalide → placeholder « Image indisponible » (pas de carré cassé).
4. **Confirm** : supprimer un post / une commande → dialog accessible, Escape ferme.
5. **Clavier** : Tab → skip-link → focus visible doré.
6. **Mobile** : zones like/comment ≥ 44 px, safe-area respectée.

---

## 6. Actions concrètes maintenant

1. Lancer le grep `window.confirm` et migrer vers `ConfirmDialog`.
2. Parcourir les onglets principaux et brancher `EmptyState` partout où la liste est vide.
3. Remplacer les `<img>` du feed / produits / avatars par `LazyImage`.
4. Coller le bloc CSS utilitaires à la fin de `src/index.css`.
5. (Optionnel) Brancher `prefetchTab` sur la Navigation.
6. Valider la checklist « tout le monde ».

---

## 7. Checklist finale Étape 4

- [ ] Aucun `window.confirm` restant dans le code actif
- [ ] EmptyState sur feed, messages, commandes, boutiques, entreprises, débats
- [ ] LazyImage / LazyVideo sur feed + produits + avatars
- [ ] CSS utilitaires (skip-link, content-visibility, tap targets, skeleton) présents
- [ ] OfflineBanner testé
- [ ] Cibles tactiles OK sur mobile
- [ ] Prefetch onglets (optionnel) activé

Une fois validé → **Étape 5** (Sentry / observabilité + alertes).
```
