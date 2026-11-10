# Intégration et validation du worker Rust/C BAARO

**Date :** 10 novembre 2026
**Périmètre :** worker média de `ltraoredr1/Baaro`. Le pipeline principal conserve FFmpeg/Node ; Rust et C interviennent dans le contrôle des sources, sans réécrire le transcodage.

## Changements

- Rust classe les fichiers selon leur signature ; les formats inconnus et les types dangereux ne sont pas acceptés.
- Un shim C appelle `libavformat` pour ouvrir les fichiers allowlistés et vérifier la présence d’un flux audio avec codec/fréquence détectés ou d’un flux vidéo avec dimensions détectées. Le résultat expose les informations audio/vidéo, dimensions, durée et état du probe.
- Node refuse un conteneur invalide, inconnu ou non vérifié avant FFmpeg. L’absence, le timeout ou l’échec du binaire ne déclenche aucun fallback permissif ; un média rejeté reçoit un statut HTTP 422.
- Le worker vérifie au démarrage que le binaire natif se charge et annonce sa version libavformat ; `/health` inclut cette version.
- Les deux recettes Docker compilent Rust+C dans un stage natif et installent FFmpeg dans l’image runtime. Le workflow CI construit les deux images et exécute le validateur dans chacune.
- Aucune dépendance Cargo ou npm supplémentaire. La compilation système requiert `build-essential`, `pkg-config` et `libavformat-dev`; le runtime dépend des bibliothèques FFmpeg apportées par le paquet `ffmpeg`.

Le probe vérifie l’ouverture du conteneur et la découverte des flux ; il ne décode pas l’intégralité du média ni ne garantit l’absence de corruption plus loin dans le fichier. FFmpeg reste responsable du décodage et du transcodage.

## Vérifications exécutées localement

| Contrôle | Résultat |
|---|---|
| `cargo fmt --check` | Réussi |
| `cargo clippy --locked -- -D warnings` | Réussi, aucun avertissement |
| `cargo test --locked` | 10 tests Rust réussis |
| Build release Rust/C | Réussi avec Rust 1.99.1 |
| Tests Node natifs | 19 vérifications : signatures sûres/dangereuses/inconnues, WAV réel et MP4 vidéo réel avec dimensions, et fichier absent |
| Test fail-closed | Réussi : binaire absent → refus au démarrage et lors du contrôle |
| Smoke `/health` | Réussi ; réponse annonce `baaro-media 0.1.0 (libavformat 60.16.100)` |
| `ldd` du binaire | Toutes les bibliothèques partagées résolues sur Linux ARM64 |
| Syntaxe Node/shell | Réussie |
| Installation npm | 27 paquets existants installés, 0 vulnérabilité signalée |

## Mesure locale

Le benchmark révisé mesure le chemin complet sur un WAV valide — processus CLI, signature Rust et probe C/libavformat — sur Linux ARM64, Node 22.23.4 et libavformat 60.16.100 : 120 mesures, médiane **30,103 ms**, p95 **31,353 ms**, moyenne **30,283 ms**, environ **33 contrôles/s**. Il s’agit d’un contrôle de validité/robustesse, pas d’une optimisation du transcodage. Cette mesure inclut le coût d’un nouveau processus et n’est pas directement comparable au précédent microbenchmark limité au sniffing.

## Limites restantes

Le sandbox ne fournit pas Docker ni `gcloud`; les deux images n’ont donc pas été bâties localement et aucun déploiement Cloud Run n’a été lancé. Le workflow GitHub met maintenant en place les builds et smoke tests des deux images ; il faudra vérifier leur résultat sur le dépôt, puis effectuer le déploiement Cloud Run dans le projet GCP de BAARO. Le benchmark cloud devra confirmer l’impact opérationnel avant toute conclusion de performance.

Les commandes reproductibles sont dans [`worker/README.md`](../worker/README.md), section « Valider et mesurer Rust/C ».
