# Validation Stories avec Rust, C et WebAssembly

Le compositeur Stories utilise deux modules WASM compilés localement et chargés au navigateur :

- `src/features/stories/native/story_policy.rs` : limites de sélection, de taille et de programmation;
- `src/features/stories/native/media_sniff.c` : signatures binaires JPEG, PNG, GIF, WebP, AVIF, MP4/QuickTime et WebM;
- `src/features/stories/lib/nativeValidation.js` : wrapper WASM avec fallback JavaScript pour les navigateurs/environnements où WASM n’est pas disponible;
- `api/_lib/story-media-signature.js` : contrôle de signature côté serveur à partir des octets lus dans R2 pendant `finalize`.

Les limites définies côté client ne sont **pas** une frontière de sécurité. La route `/api/media` reste autoritaire : elle applique 100 MiB maximum au dossier Stories, vérifie la taille réelle R2 et refuse un type MIME qui ne correspond pas à la signature. Les contrôles RLS et le statut des RPC Supabase doivent toujours être vérifiés dans l’environnement réellement déployé.

## Compilation et tests

Pour compiler depuis les sources, il faut Rust stable avec la cible WASM, ainsi que `clang` et `lld` capables de cibler `wasm32-unknown-unknown` :

```sh
rustup toolchain install stable --component rustfmt
rustup target add wasm32-unknown-unknown
# Installer clang et lld depuis le gestionnaire de paquets de l'OS.
npm run test:stories
npm run build
```

`npm run dev` et `npm run build` exécutent la génération WASM automatiquement. Les petits fichiers `public/wasm/stories_policy.wasm` et `public/wasm/stories_media.wasm` sont versionnés pour les plateformes de déploiement qui ne disposent pas de Rust/Clang; quand les sources natives changent, lancer `npm run test:stories` et inclure les binaires régénérés dans le même commit. La CI dispose de la toolchain et compile depuis les sources avant de lancer les tests.

Les tests couvrent les frontières numériques du noyau Rust, les signatures reconnues/rejetées par C/WASM, le fallback JavaScript, la cohérence MIME côté serveur, et la construction d’un payload par média sélectionné.
