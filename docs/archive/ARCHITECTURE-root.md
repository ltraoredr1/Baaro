# BAARO — Architecture modulaire

## Installation rapide

1. Copier le contenu de `src/app/` dans ton projet `src/app/`
2. Copier `src/features/` (index.js uniquement — réexportent les components existants)
3. Copier `src/services/`
4. Remplacer `src/main.jsx` et `src/App.jsx` par les versions fournies
5. `npm run dev` — aucun déplacement de gros fichiers encore nécessaire

## Structure

```
src/
├── app/           # Shell (App, MainShell, tabs)
├── features/      # Une feature = un dossier + index.js
├── components/    # UI partagée (Header, Nav, …) — inchangé pour l'instant
├── services/      # supabase, walletApi
├── hooks/, lib/, contexts/
```

## Migration physique (ensuite)

Pour chaque feature, déplacer les fichiers :

```bash
# Exemple wallet
mv src/components/WalletTab.jsx src/features/wallet/
mv src/components/RedeemSection.jsx src/features/wallet/
mv src/components/ReferralSection.jsx src/features/wallet/
# Puis éditer features/wallet/index.js pour exporter en local
```

Mettre à jour les imports relatifs dans les fichiers déplacés.

## Lazy loading

Tous les onglets passent par `app/tabs.jsx` → un chunk JS par feature.
