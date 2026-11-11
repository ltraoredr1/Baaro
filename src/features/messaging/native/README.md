# BAARO messaging crypto — fondation v3

Ce crate est une **fondation expérimentale isolée**. Il ne remplace pas `src/features/messaging/lib/crypto.js`, les clés RSA publiées dans `profiles.public_key`, les sauvegardes PIN/phrase secrète, ni les payloads historiques `RSA-OAEP+AES-GCM` v1/v2. Le code de messagerie en production n'appelle pas ces fonctions.

## Primitive et format

Le crate fournit des fonctions WASM pour générer une identité X25519, chiffrer vers une clé publique avec une clé éphémère par message, déchiffrer, calculer un safety number de paire d'identités et comparer deux buffers de même longueur à temps constant. Le chiffrement dérive une clé AES-256-GCM avec HKDF-SHA-256 à partir du secret X25519, d'un sel aléatoire et d'un contexte fixe.

L'enveloppe binaire expérimentale est `BAR3 | ephemeral_public_key[32] | salt[32] | nonce[12] | ciphertext_and_tag`. Les AAD et l'information HKDF sont versionnés dans `src/features/messaging/native/src/lib.rs`. Les entrées sont bornées à 10 Mio; les clés et champs à taille fixe sont validés.

## Limites importantes

- Une clé éphémère par message ne constitue pas à elle seule Double Ratchet/X3DH, ne gère ni pré-clés, ni ordre des messages, ni multi-appareil, ni rotation/récupération des identités. Ce schéma ne fournit pas de forward secrecy complet contre une compromission ultérieure de la clé privée statique du destinataire.
- L'enveloppe BAR3 n'authentifie pas l'expéditeur; ne pas l'utiliser comme protocole de messagerie E2E prêt pour production.
- L'empreinte calculée ne devient pas une vérification d'identité digne de confiance avant d'être liée à un mécanisme de comparaison utilisateur et à des avertissements de changement de clé.
- Le module WASM ne protège pas de XSS et l'effacement mémoire côté navigateur ne peut être garanti comme sur un coffre matériel. Ne pas y importer des secrets de compte existants.
- Le buffer privé copié en mémoire linéaire WASM est effacé côté Rust avant sa libération; cela ne peut pas effacer la copie originale détenue par JavaScript ou un snapshot mémoire du moteur.
- Le format BAR3 n'est pas accepté par les clients actuels; ne jamais émettre de payload BAR3 en production avant déploiement coordonné de la lecture, persistance de clés, récupération, versionnement, et tests d'interopérabilité.
- Cette tranche ne chiffre pas les médias et n'ajoute pas de code C dédié : les primitives cryptographiques C maison augmenteraient la surface de risque sans bénéfice démontré.

## Prototype OpenMLS (tests uniquement)

OpenMLS `0.9.2` est ajouté uniquement comme dépendance de développement. `tests/openmls_candidate.rs` vérifie un échange de test à deux clients, incluant l’ajout au groupe, le Welcome et les messages TLS sérialisés. OpenMLS n’est pas lié au WASM ni au flux applicatif; les clients continuent d’utiliser le chiffrement RSA historique. Ce test ne valide pas l’authentification de production, le service Supabase de livraison, le stockage persistant ou l’exécution dans le navigateur. Ne pas activer avant l’intégration de ces services et une revue de sécurité.

## Vérification

Depuis la racine du dépôt :

```sh
npm run check:messaging-rust
npm run test:messaging-crypto
npm run build:messaging-crypto -- --strict
```

Le binding JS `lib/crypto-wasm.js` est volontairement optionnel et échoue clairement si l'artefact `public/wasm/messaging_crypto.js` n'a pas été construit. La façade active RSA v1/v2 reste inchangée.

Le build normal peut réutiliser les artefacts versionnés si `wasm-pack` manque ou échoue; le build Vercel non strict les utilise aussi directement. La CI épingle `wasm-pack 0.15.1`, reconstruit en mode strict et échoue si les fichiers publiés divergent : les déploiements doivent rester protégés par ce contrôle.
