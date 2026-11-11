# Migration E2E de BAARO vers MLS — recherche et plan d’implémentation

**État :** un premier prototype OpenMLS isolé est implémenté et testé côté hôte; aucune suite cryptographique nouvelle n’est activée dans les messages de production.

## Tranche implémentée dans cette copie de travail

- `openmls = 0.9.2`, `openmls_rust_crypto = 0.6.0`, `openmls_basic_credential = 0.6.0` et `tls_codec` ont été ajoutés **uniquement en dépendances de développement** du crate Rust messagerie. Le verrou Cargo est mis à jour. OpenMLS n’est donc pas ajouté au binaire WASM qui sert au frontend.
- `src/features/messaging/native/tests/openmls_candidate.rs` exerce un scénario de deux clients avec un KeyPackage local de test, l’ajout du second client, les octets TLS du Commit et du Welcome, puis la sérialisation/désérialisation et le traitement d’un message applicatif MLS.
- Validation réussie sur cette copie : `cargo fmt --check`, les 8 tests Rust existants et le nouveau test OpenMLS (9 tests au total), `cargo clippy --all-targets -- -D warnings`, et `cargo check --target wasm32-unknown-unknown` du crate de production existant.

Cette tranche prouve seulement que la bibliothèque peut exécuter le chemin cryptographique de base sur l’hôte et que les dépendances de test ne contaminent pas le build WASM existant. Le test utilise le provider OpenMLS RustCrypto, des identités fictives et un stockage en mémoire; ce choix est un smoke test, pas une décision de provider de production. Il ne valide ni identité de production, ni serveur de livraison, ni persistance, ni exécution OpenMLS dans le navigateur/WebView. Il ne modifie ni `useMessaging.js`, ni le format des messages envoyés, ni les clés RSA historiques. Elle ne doit pas être interprétée comme une activation E2E MLS en production.

## Décision provisoire sur la bibliothèque

La fondation Rust `BAR3` existante ne doit pas être raccordée au flux applicatif : elle ne fournit pas le protocole de session, l’authentification de l’expéditeur, la gestion des appareils ni la rotation et la récupération des clés. Le README du crate la qualifie d’expérimentale et interdit explicitement son émission en production [1].

La piste retenue pour le prototype est **OpenMLS**, implémentation Rust de MLS (RFC 9420), plutôt que le crate `BAR3`. La version vérifiée sur crates.io au 11 novembre 2026 est `openmls 0.9.2`, sous licence MIT, avec Rust 1.91 minimum [15]. Le dépôt contient un module WebAssembly et documente une fonctionnalité JavaScript; son manuel précise toutefois que WASM doit fournir une source d’aléa sûre et l’heure via les API JavaScript du runtime [2][3]. Le target WASM a été vérifié pour le crate BAARO existant, mais OpenMLS lui-même n’a pas encore été compilé ni testé en WebAssembly.

L’audit indépendant d’OpenMLS publié par Phoenix R&D rapporte huit constats SRLabs : un de sévérité élevée, sept corrigés dans les versions 0.8.1 et 0.7.3, et un constat de faible sévérité qui restait en cours de traitement à la date de l’article, le 27 mai 2026 [4]. Avant toute intégration runtime, il faut confirmer dans les notes de version et le rapport complet le statut de ce dernier constat pour la version retenue. La politique de sécurité OpenMLS précise que sa couverture porte sur le crate principal et exclut plusieurs composants externes, dont le provider cryptographique et le stockage fournis par l’application [5]. Cette auditabilité réduit le risque de réinventer un protocole, mais ne constitue pas une certification du produit BAARO.

`libsignal` n’est pas retenu comme dépendance provisoire : son dépôt officiel indique une licence AGPL-3.0, précise que l’utilisation hors des clients Signal n’est pas prise en charge et publie surtout des bibliothèques Java, Swift et TypeScript avec des couches natives dont les interfaces peuvent évoluer [6]. Toute adoption nécessiterait d’abord une revue juridique et d’intégration dédiée.

## Ce que MLS implique pour BAARO

MLS est conçu pour des groupes de deux clients comme pour des groupes plus larges; l’architecture de la RFC 9750 distingue un service d’authentification et un service de livraison [7]. Un client MLS est un appareil/client, pas seulement un compte utilisateur; BAARO doit donc définir explicitement comment plusieurs appareils d’un même compte sont ajoutés et retirés.

Pour un échange asynchrone, les appareils publient des KeyPackages. Le service de livraison doit permettre d’en récupérer un et garantir qu’un KeyPackage à usage unique ne soit consommé qu’une fois [8]. Les opérations de groupe produisent des messages de contrôle (propositions, commits et welcomes) qui doivent être authentifiés, livrés et traités dans le bon groupe et dans un ordre cohérent [9]. MLS est une couche de chiffrement, pas un protocole complet de messagerie : le produit doit toujours fournir l’identité, l’autorisation d’ajout/retrait, la livraison et les règles de récupération [7].

L’état persistant OpenMLS contient des secrets. Son `StorageProvider` doit supprimer irrévocablement les clés consommées; OpenMLS traite ce stockage comme fiable et ne revalide pas l’intégrité de l’état rechargé. Le backend local BAARO devra donc garantir l’atomicité et protéger l’intégrité des états, par exemple avec chiffrement authentifié et clé liée à l’appareil [10]. Une simple sérialisation JSON dans `localStorage` ne convient pas.

Dans l’état actuel du dépôt, `profiles.public_key` et `useCryptoKeys.js` sont orientés vers une seule clé RSA par compte; `useMessaging.js` chiffre les messages vers le destinataire et vers l’expéditeur, puis stocke la charge utile dans `messages.text`. Aucun schéma SQL de service de clés MLS / appareils n’est présent dans cette copie de travail. La migration ne doit donc pas inventer des RPC ou politiques RLS et ne peut pas être déclarée terminée avant inspection et test du schéma réel Supabase.

## Portes restantes avant activation

1. **Pinner et vérifier la dépendance.** Confirmer le statut du rapport SRLabs et les correctifs de la version retenue. Compiler OpenMLS avec sa fonctionnalité JS sur `wasm32-unknown-unknown`; exécuter des tests interopérables et des tests navigateur/WebView. Le dépôt OpenMLS indique que le target WASM est construit en CI, mais qu’il n’est pas dans sa liste des cibles à la fois construites et testées [2].
2. **Créer un cœur MLS isolé et non sélectionnable en production.** Étendre le test vers un adaptateur MLS versionné, avec une API étroite pour initialiser un groupe, traiter un Welcome, créer un message applicatif et traiter les messages entrants. Ne jamais exposer les secrets MLS dans les logs, erreurs, URLs ou données Supabase.
3. **Concevoir le service d’appareils et de livraison.** Définir avec le schéma Supabase réellement déployé les identifiants de clients/appareils, credentials MLS liés aux utilisateurs, KeyPackages, consommation atomique des pré-clés, livraison et ordre des commits, ainsi que retrait/révocation d’appareil. Aucun payload MLS ne doit être émis avant que tous les clients de la conversation sachent le traiter.
4. **Persister l’état de façon sûre.** Concevoir un stockage d’état chiffré et intègre dans IndexedDB/WebView, avec transactions atomiques et verrouillage inter-onglets. Définir la sauvegarde/récupération : ne pas envoyer l’état ou les clés MLS au serveur en clair. Tester perte de stockage, restauration sur nouvel appareil et suppression d’un ancien appareil.
5. **Migration sans perte d’historique.** Maintenir la lecture des payloads RSA v1/v2 existants. Un groupe MLS nouvellement initialisé ne déchiffre pas rétroactivement ces anciens messages; il faudra conserver la lecture historique RSA et basculer une conversation uniquement après négociation de capacités et approbation explicite des clients concernés. La version de production doit continuer à écrire RSA tant que l’option MLS est fermée.
6. **Tests, audit et activation.** Ajouter tests Rust unitaires, WASM, interopérabilité et intégration de deux comptes/deux appareils; couvrir rejeu, désordre, duplication, message invalide, commit divergent, retrait d’appareil, rollback et changements de version. Effectuer une revue indépendante du protocole applicatif et de son stockage. Garder le feature flag désactivé jusqu’à réussite de ces portes et accord de mise en production.

Aucun chiffrement « maison » C/Rust supplémentaire n’est prévu : le rôle de BAARO est d’intégrer correctement l’implémentation de protocole et ses services auxiliaires, pas de réimplémenter ses primitives.

## Sources

[1]: https://github.com/ltraoredr1/Baaro/blob/main/src/features/messaging/native/README.md "Limites du prototype Rust BAR3 de BAARO"
[2]: https://github.com/openmls/openmls "Dépôt officiel OpenMLS"
[3]: https://book.openmls.tech/user_manual/wasm.html "Documentation officielle OpenMLS WebAssembly"
[4]: https://blog.phnx.im/openmls-independent-security-audit/ "Résultats de l’audit indépendant OpenMLS publié par Phoenix R&D"
[5]: https://github.com/openmls/openmls/blob/main/SECURITY.md "Politique de sécurité OpenMLS"
[6]: https://github.com/signalapp/libsignal "Dépôt officiel libsignal et conditions d’usage"
[7]: https://www.rfc-editor.org/rfc/rfc9750.html "RFC 9750 — Architecture MLS"
[8]: https://book.openmls.tech/user_manual/create_key_package.html "Guide OpenMLS — KeyPackages et livraison"
[9]: https://book.openmls.tech/user_manual/processing.html "Guide OpenMLS — traitement des messages de protocole"
[10]: https://book.openmls.tech/user_manual/persistence.html "Guide OpenMLS — persistance, secret et intégrité de l’état"
[11]: https://datatracker.ietf.org/doc/html/rfc9420 "RFC 9420 — protocole Messaging Layer Security"
[12]: https://book.openmls.tech/user_manual/migration.html "Guide OpenMLS — migration de version du stockage"
[13]: https://signal.org/docs/specifications/x3dh/ "Spécification Signal X3DH"
[14]: https://signal.org/docs/specifications/doubleratchet/ "Spécification Signal Double Ratchet"
[15]: https://crates.io/crates/openmls/0.9.2 "Version et licence OpenMLS 0.9.2"
