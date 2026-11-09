# Nettoyage et validation du worker Rust BAARO

**Date :** 9 novembre 2026  
**Périmètre :** worker média de `ltraoredr1/Baaro`. Aucun déploiement distant ni push GitHub n’a été effectué.

## Nettoyage effectué

Rust est conservé pour la détection du type réel des fichiers par signature. Le parsing WebVTT est désormais réalisé uniquement en JavaScript : le module `worker/rust/baaro-media/src/vtt.rs`, la commande CLI `vtt-parse`, son adaptateur `spawnSync`, ses tests de parité et le patch historique redondant `BAARO-rust-worker.patch` ont été supprimés. Le helper JSON pour tableaux, inutilisé après cette suppression, a également été retiré.

Le manifeste Cargo ne déclarait déjà aucun crate externe. Son bloc `[dependencies]` vide a été supprimé ; le `Cargo.lock` reste en place pour préserver les builds `--locked`. Aucun paquet npm n’a été ajouté ou supprimé.

## Contrôles après nettoyage

| Contrôle | Résultat |
|---|---|
| `cargo fmt --check` | Réussi |
| `cargo clippy --locked -- -D warnings` | Réussi, aucun code mort |
| `cargo test --locked` | 7 tests réussis, 0 échec |
| Compilation release | Réussie avec Rust 1.99.1 |
| Test Node des signatures | 7 vérifications réussies |
| Parsing WebVTT JavaScript | Syntaxe et test fonctionnel réussis |
| Benchmark du détecteur de signature | 120 mesures : médiane 1,818 ms, p95 2,176 ms, moyenne 1,856 ms |
| Smoke test du worker | Démarrage et `/health` réussis |

Le benchmark WebVTT précédent motivait la suppression : le parsing JS médian mesuré était de 0,003 ms pour 1 cue, 0,054 ms pour 100 cues et 1,022 ms pour 2 000 cues ; les appels Rust par processus étaient respectivement de 1,698 ms, 1,993 ms et 6,230 ms.

## Point à vérifier avant production

Si le binaire Rust de détection est absent ou ne démarre pas, `sniffFile()` renvoie `null` et le worker poursuit actuellement le traitement sans refuser le fichier. L’image Docker prévoit de construire et copier le binaire ; il faut toutefois vérifier sa présence et son exécution dans l’image déployée, ou faire échouer le traitement si la vérification est indisponible.

Le sandbox n’a ni Docker ni `gcloud` ni accès au projet Cloud Run. Les contrôles ont donc été réalisés localement sur Linux ARM64 et ne remplacent pas le build de l’image ni un test Cloud Run sur l’architecture et la charge de production.

Les commandes répétables sont dans `worker/README.md`, section « Valider et mesurer Rust » ; le benchmark conservé mesure uniquement le détecteur de signatures (`npm run bench:rust`).
