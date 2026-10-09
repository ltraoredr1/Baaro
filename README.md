# BAARO — plateforme sociale internationale nouvelle génération

**BAARO** est une plateforme sociale internationale pensée pour réunir, dans une même expérience, **réseau social, vidéo, messagerie, communautés, découverte, IA, créateurs, commerce et outils de confidentialité**.

Le projet est conçu autour de quatre priorités :

1. **Rapidité et fiabilité** — architecture adaptée au Web et au mobile, cache, mode réseau faible, traitement asynchrone des médias et CDN/R2.
2. **Sécurité et confidentialité** — Supabase RLS, identité UUID canonique, chiffrement côté client pour la messagerie, séparation des secrets et contrôle des opérations sensibles.
3. **Internationalisation** — interface multilingue, support du N'Ko et des langues ouest-africaines, contenu et recommandations adaptés aux régions.
4. **Innovation** — IA, recommandation, traitement vidéo, traduction, mode hors-ligne, économie créateur et fonctions futures extensibles.

> **Conditions :
> N'appliquer pas les migrations à n'importe comment sans maîtriser le projet

---

## 🎵 BAARO Sounds — bibliothèque audio et droits

BAARO intègre une bibliothèque audio conçue pour le **Video Studio**. L'objectif est de permettre l'utilisation de sons maliens, africains et internationaux tout en séparant clairement les contenus originaux, les contenus proposés par les créateurs, les sons traditionnels et les contenus sous licence.

### Principe de sécurité juridique

Un son tiers n'est pas considéré comme libre simplement parce qu'il est local, traditionnel ou disponible sur Internet. Le catalogue conserve notamment :

- le titulaire des droits (`rights_holder`) ;
- le type et le nom de licence (`license_code`, `license_name`) ;
- l'obligation éventuelle d'attribution ;
- l'autorisation commerciale ;
- l'autorisation de remix ;
- les territoires autorisés ;
- la source ;
- le statut de validation (`pending`, `approved`, `rejected`, `disabled`) ;
- la date de vérification des droits.

Les utilisateurs peuvent proposer un son via `submit_baaro_sound(...)`. La proposition reste en attente tant qu'elle n'a pas été validée. La publication dans le catalogue public est réservée au service d'administration.

### Catégories

- **BAARO Original** : créations dont BAARO contrôle les droits.
- **Créateur** : morceau fourni par un artiste avec déclaration/licence.
- **Tradition & Culture** : contenu culturel nécessitant une vérification appropriée des droits applicables et de l'enregistrement utilisé.
- **Sous licence** : contenu acquis ou autorisé contractuellement.
- **Domaine public / CC0 / CC BY** : uniquement lorsque la licence applicable a été vérifiée.

### Dans le Video Studio

L'utilisateur peut :

1. rechercher un son ;
2. écouter un aperçu ;
3. voir sa licence et l'éventuelle attribution ;
4. sélectionner le son ;
5. l'utiliser dans une création photo/vidéo/texte ;
6. conserver le son d'origine ou le couper lorsque le montage le permet.

Chaque sélection validée peut être comptabilisée par `record_sound_usage(...)` afin de suivre la popularité du catalogue.

> **Important :** BAARO ne doit pas importer ou distribuer de musique commerciale tierce sans autorisation. Pour les sons traditionnels ou locaux, la provenance et les droits de l'enregistrement utilisé doivent être vérifiés. Le système technique facilite cette gestion ; il ne remplace pas une validation juridique locale ou internationale.


## 1. Architecture générale

```text
                         ┌─────────────────────┐
                         │       BAARO UI      │
                         │ React + Vite + PWA  │
                         │      Capacitor      │
                         └──────────┬──────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
          ┌────────────┐     ┌────────────┐     ┌────────────┐
          │  Supabase  │     │   Vercel   │     │ Cloudflare │
          │ Auth/DB/RL │     │    API     │     │     R2     │
          │ Realtime   │     │ orchestrat.│     │   médias   │
          └────────────┘     └─────┬──────┘     └────────────┘
                                    │
                                    ▼
                           ┌────────────────┐
                           │ Worker média    │
                           │ FFmpeg / IA     │
                           │ Cloud Run/etc.  │
                           └────────────────┘
```

### Technologies principales

- **Frontend :** React 18 + Vite.
- **Web/mobile :** PWA + Capacitor Android.
- **Base de données :** Supabase PostgreSQL.
- **Authentification :** Supabase Auth.
- **Temps réel :** Supabase Realtime.
- **Sécurité :** Row Level Security (RLS) + fonctions PostgreSQL contrôlées.
- **API :** Vercel Serverless dans `api/`.
- **Stockage média :** Cloudflare R2.
- **Traitements lourds :** worker externe, notamment FFmpeg/Whisper/IA.
- **Appels :** Daily/WebRTC selon configuration.
- **Paiements :** Stripe/CinetPay selon pays et configuration.
- **Internationalisation :** i18next + fichiers `locales/*.json`.

### Règle importante sur `api/`

Le dossier **`api/` est volontairement conservé tel quel** dans cette version. Les évolutions du profil, des statistiques, des langues et des réglages sont coordonnées principalement côté frontend et Supabase.

---

# 2. Fonctionnalités principales

## Accueil / Feed

Le Feed permet notamment :

- publications texte, image et vidéo ;
- likes et commentaires ;
- partage et interactions sociales ;
- sondages ;
- Stories ;
- pagination/cursor ;
- temps réel ;
- recommandations ;
- récompenses créateur ;
- upload média via le pipeline R2.

### Limite vidéo du Feed

Les vidéos publiées dans le **Feed sont limitées à 50 MB** côté interface/pipeline BAARO.

---

# 3. Vidéos

Le module Vidéos est séparé du Feed et utilise le pipeline média nouvelle génération.

Fonctions prévues/implémentées dans le socle :

- vidéos longues ;
- upload multipart ;
- stockage R2 ;
- thumbnails ;
- transcodage asynchrone ;
- sous-titres ;
- traduction ;
- doublage ;
- modération ;
- extraction de caractéristiques ;
- highlights ;
- plan de montage IA ;
- recommandations ;
- signaux de visionnage ;
- completion rate ;
- rewatch rate ;
- signaux négatifs ;
- monétisation créateur.

**Il n'y a pas de limite artificielle BAARO de 50 MB pour l'onglet Vidéos.** La capacité réelle dépend du stockage R2, du worker et des limites du fournisseur utilisées pour l'upload.

---

# 4. Stories

Les Stories sont temporaires et disposent d'un système d'engagement dédié.

### Engagement

Pour le propriétaire d'une Story :

- nombre de vues ;
- liste nominative des personnes ayant vu la Story ;
- nombre de likes/réactions ;
- liste nominative des personnes ayant réagi ;
- réponses ;
- heure de consultation/réaction lorsque disponible.

### Confidentialité

Les listes nominatives de vues et de réactions sont réservées aux personnes autorisées, notamment au propriétaire du contenu. Les règles RLS et les fonctions sécurisées doivent rester actives.

---

# 5. Posts et statistiques d'engagement

Les publications disposent de compteurs et de signaux d'engagement :

- vues ;
- likes ;
- commentaires ;
- partage ;
- auteur ;
- date de publication ;
- média associé.

Les vues sont dédupliquées selon les règles définies par la couche Supabase afin d'éviter qu'un simple rafraîchissement artificiellement gonfle le compteur.

---

# 6. Profil BAARO

Le profil est conçu comme une page publique de présentation, avec modification séparée dans les Réglages.

### Statistiques visibles sur le profil

- **Publications**
- **Likes**
- **Abonnés**
- **Abonnements**
- **Amis**

Ces statistiques sont regroupées derrière la fonction Supabase `get_profile_stats()`.

### Recherche → profil

La recherche peut afficher un aperçu du profil :

- avatar ;
- nom ;
- `@handle` ;
- statistiques principales ;
- accès au profil.

**Le profil ouvert depuis la recherche est en lecture seule.**

La modification du profil se fait **uniquement dans Réglages**. Cela évite d'avoir plusieurs écrans concurrents capables de modifier les mêmes informations.

---

# 7. Recherche globale

La recherche BAARO est prévue pour découvrir :

- personnes ;
- publications ;
- communautés ;
- débats ;
- profils ;
- contenus pertinents.

Le système utilise une recherche bornée et des contrôles d'accès Supabase. Les utilisateurs bloqués doivent être exclus des résultats concernés.

---

# 8. Messagerie nouvelle génération

Le module de messagerie comprend le socle suivant :

- chiffrement E2E côté client ;
- réactions ;
- réponses ;
- favoris ;
- messages épinglés ;
- recherche ;
- indicateur de frappe ;
- accusés de livraison ;
- accusés de lecture ;
- messages éphémères ;
- images, vidéos et fichiers ;
- messages vocaux ;
- appels audio/vidéo ;
- temps réel ;
- multi-appareils ;
- signalement ;
- fonctions IA : résumé, réponse intelligente, traduction, reformulation et extraction de tâches.

Les clés privées ne doivent pas être exposées au serveur lorsque le mécanisme E2E du client est utilisé.
Les comptes anonymes ne peuvent pas utiliser la messagerie. 

---

# 9. Communautés

Le système communautaire prend en charge le socle :

- groupes publics/privés ;
- catégories ;
- canaux ;
- membres ;
- rôles ;
- invitations ;
- modération ;
- bannissement ;
- signalement ;
- découverte ;
- événements et espaces communautaires.

Les opérations sensibles doivent rester protégées par RLS et les fonctions PostgreSQL prévues à cet effet.

---

# 10. IA et BAARO Future Nexus

BAARO est organisé pour accueillir une couche d'intelligence transverse :

- assistant IA ;
- moteur d'intention ;
- recommandations ;
- traduction universelle ;
- mémoire privée ;
- Trust Graph ;
- Trust ID ;
- détection anti-arnaque ;
- outils créateur ;
- commerce ;
- automatisations ;
- synchronisation hors ligne ;
- fonctionnalités expérimentales activables progressivement.

Les actions IA sensibles doivent demander une confirmation explicite lorsqu'elles peuvent modifier un compte, une donnée ou déclencher une opération importante.

---

# 11. Réglages : centre de contrôle BAARO

Les **Réglages** sont le seul endroit où le profil peut être modifié.

Ils regroupent notamment :

### Compte et profil

- nom ;
- prénom/nom ;
- date de naissance ;
- bio ;
- avatar/photos ;
- handle ;
- pays ;
- localisation ;
- e-mail/téléphone ;
- liens de profil.

### Performance

- préchargement intelligent ;
- mode batterie ;
- mode réseau faible ;
- économie de données ;
- cache local intelligent ;
- lecture automatique vidéo ;
- synchronisation hors ligne ;
- réduction des animations ;
- texte agrandi.

### IA

- région IA ;
- suggestions IA ;
- traduction automatique ;
- traduction/sous-titres média ;
- préférence pour les traitements privés lorsque disponibles.

### Confidentialité et sécurité

- profil privé ;
- appareils ;
- biométrie selon plateforme ;
- notifications ;
- contrôle des données ;
- export ;
- gestion des sessions et options de sécurité.


---

# 12. Langues et N'Ko

BAARO dispose d'un système i18n basé sur des fichiers JSON dans `locales/`.

### Interfaces actuellement préparées

- 🇫🇷 Français — `fr`
- 🇬🇧 English — `en`
- 🇸🇦 العربية — `ar`
- **ߒߞߏ N'Ko — `nqo`**
- **Bozo — `boz`**
- **Dogon — `dog`**
- **Soninké — `snk`**
- Bamanankan — `bm`

D'autres langues peuvent être ajoutées progressivement.

### N'Ko

Le mode `nqo` est prévu pour permettre à l'application entière d'utiliser l'interface N'Ko avec direction **RTL (droite vers gauche)**.

Les langues Bozo, Dogon et Soninké disposent de leurs fichiers de traduction et peuvent être étendues progressivement avec une traduction linguistique humaine validée.

> **Important :** un fichier de langue présent dans le dépôt ne signifie pas que chaque phrase métier est déjà traduite à 100 %. Les nouvelles chaînes doivent être ajoutées à chaque fichier avant de considérer une langue comme totalement localisée.

---

# 13. Internationalisation technique

Le système utilise notamment :

```text
i18n.js
locales/fr.json
locales/en.json
locales/ar.json
locales/nqo.json
locales/boz.json
locales/dog.json
locales/snk.json
```

Le code doit éviter de mettre du texte utilisateur en dur dans les composants lorsque la chaîne est destinée à être traduite.

Pour ajouter une fonctionnalité multilingue :

1. ajouter une clé de traduction ;
2. l'ajouter aux langues prises en charge ;
3. utiliser `i18next` / `react-i18next` dans le composant ;
4. tester LTR et RTL ;
5. vérifier les textes longs et les caractères Unicode.

---

# 14. Stockage média Cloudflare R2

Les gros fichiers média ne doivent pas transiter inutilement par Supabase Storage ou la mémoire d'une fonction Vercel.

Variables serveur principales :

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=baaro-media
R2_PUBLIC_BASE_URL=
```

Les clés R2 sont **strictement serveur**. Elles ne doivent jamais être préfixées par `VITE_`.

---

# 15. Worker vidéo

Le worker externe traite les opérations lourdes :

1. récupération du job ;
2. lecture du média depuis R2 ;
3. traitement FFmpeg/Whisper/IA ;
4. génération des artefacts ;
5. écriture dans R2 ;
6. mise à jour de l'état du job.

Variables principales :

```env
BAARO_MEDIA_PROCESSOR_URL=https://worker.example.com/process
BAARO_WORKER_SECRET=
BAARO_WORKER_ID=
```

Le worker peut être déployé sur Cloud Run ou une infrastructure équivalente capable d'exécuter des traitements longs.

**Vercel orchestre ; le worker traite.**

---

# 16. Base de données : une migration coordonnée

Pour une **nouvelle base Supabase**, le projet utilise maintenant une seule migration active :

```text
supabase/migrations/0001_baaro_unified.sql
```

Cette migration regroupe les différentes couches historiques du projet dans un ordre coordonné, notamment :

- schéma de base ;
- social ;
- vidéo ;
- messagerie ;
- Stories ;
- recherche ;
- communautés ;
- Future Nexus ;
- sécurité ;
- profil et statistiques ;
- vues et likes ;
- réglages cloud ;
- performance ;
- préférences linguistiques.

Les anciennes migrations sont conservées uniquement à des fins d'audit dans :

```text
supabase/legacy_migrations/
```

### Attention

`0001_baaro_unified.sql` est destinée à une **base fraîche ou reconstruite**. Ne pas l'exécuter aveuglément sur une base de production déjà migrée. Pour une base existante, effectuer une stratégie de migration contrôlée, sauvegarde et vérification du schéma.

---

# 17. Identité utilisateur

L'identité canonique est :

```text
auth.users.id
```

Les tables métier utilisent cet UUID comme référence.

Le nom, l'e-mail, le téléphone et le handle sont des attributs de l'utilisateur et ne doivent pas remplacer l'UUID comme clé relationnelle.

---

# 18. Sécurité

Principes appliqués :

- RLS sur les données sensibles ;
- contrôle de `auth.uid()` ;
- fonctions PostgreSQL bornées et contrôlées ;
- séparation des secrets serveur/client ;
- clés R2 côté serveur uniquement ;
- opérations financières côté serveur ;
- contrôle des blocs et de la visibilité ;
- limitations/rate limits lorsque prévues ;
- journalisation des événements de sécurité ;
- protection des appareils ;
- scanner de secrets ;
- contrôles de sécurité CI ;
- chiffrement E2E pour le contenu de messagerie prévu par le client.

### Principe absolu

Ne jamais considérer le frontend comme une frontière de sécurité. Toute autorisation importante doit être vérifiée côté serveur/Supabase.

---

# 19. Installation locale

Prérequis :

- Node.js compatible avec le projet ;
- npm ;
- projet Supabase ;
- compte Cloudflare R2 pour les médias si utilisé ;
- variables d'environnement nécessaires.

Installation :

```bash
npm install
cp .env.example .env.local
npm run dev
```

Build :

```bash
npm run build
```

Prévisualisation :

```bash
npm run preview
```

---

# 20. Vérifications du projet

Les scripts disponibles couvrent notamment :

```bash
npm run check:production
npm run audit:security
npm run check:lock
npm run check:e2e
npm run check:e2e:smoke
npm run check:payout
npm run check:ai
npm run check:notifications
npm run check:performance
npm run check:android
npm run check:future
npm run check:security-hardening
npm run check:secrets
npm run check:migrations:security
```

Avant un déploiement, exécuter au minimum les contrôles de production, sécurité, secrets, migrations et build.

---

# 21. Déploiement production

## Frontend / API

Le frontend et les fonctions sous `api/` sont prévus pour **Vercel**.

## Base de données

Configurer Supabase Auth, PostgreSQL, RLS et Realtime puis appliquer la migration unifiée sur un environnement de staging avant production.

## Médias

Configurer Cloudflare R2 puis connecter le worker média.

## Worker

Déployer le worker sur Cloud Run ou une plateforme équivalente et renseigner :

```env
BAARO_MEDIA_PROCESSOR_URL=
BAARO_WORKER_SECRET=
BAARO_WORKER_ID=
```

## Mobile Android

Le projet contient une configuration Capacitor. Après modification du frontend :

```bash
npm run build
npx cap sync android
```

Puis ouvrir/build l'application Android avec l'outillage Android configuré.

---

# 22. Variables d'environnement

Utiliser `.env.example` comme référence.

### Règle de sécurité

Les variables publiques destinées au frontend peuvent utiliser le préfixe `VITE_` lorsque nécessaire.

Les secrets tels que :

- clés R2 ;
- clés Stripe secrètes ;
- secrets worker ;
- clés IA privées ;
- secrets webhook ;

**ne doivent jamais être exposés avec `VITE_`.**

---

# 23. Organisation du dépôt

```text
BAARO/
├── api/                       # API Vercel — ne pas modifier sans nécessité
├── android/                   # projet Android Capacitor
├── locales/                   # traductions
├── native-plugins/            # plugins natifs
├── public/                    # assets publics / branding
├── scripts/                   # contrôles, sécurité et validation
├── src/
│   ├── components/            # composants UI
│   ├── contexts/              # contextes React
│   ├── features/              # modules fonctionnels
│   ├── hooks/                 # hooks
│   ├── lib/                   # logique partagée
│   ├── pages/                 # pages
│   ├── services/              # services applicatifs
│   └── store/                 # état applicatif
├── supabase/
│   ├── migrations/             # migration active unifiée
│   ├── legacy_migrations/      # historique/audit
│   └── functions/              # fonctions Supabase
├── worker/                    # traitements média lourds
├── capacitor.config.json
├── vite.config.js
└── package.json
```

---

# 24. Philosophie produit

BAARO ne cherche pas seulement à reproduire les fonctions des réseaux sociaux existants. Le projet cherche à réunir dans une même infrastructure :

**Social + Video + Messaging + Community + AI + Creator Economy + Commerce + Discovery + Offline + Local Languages.**

L'objectif est une plateforme :

- internationale ;
- rapide ;
- accessible avec des réseaux faibles ;
- adaptée au mobile ;
- respectueuse de la confidentialité ;
- ouverte à plusieurs langues et écritures ;
- extensible par modules ;
- capable d'évoluer sans réécrire toute son infrastructure.

---

# 25. Règles de développement BAARO

Avant d'ajouter une fonctionnalité :

1. vérifier si elle existe déjà ;
2. réutiliser les services et hooks existants ;
3. ne pas créer un deuxième système concurrent pour la même donnée ;
4. respecter l'UUID utilisateur canonique ;
5. protéger les opérations sensibles côté serveur ;
6. ajouter les traductions ;
7. tester mobile et Web ;
8. tester le mode réseau faible lorsque la fonctionnalité utilise beaucoup de données ;
9. respecter RLS ;
10. ne pas exposer de secrets ;
11. mettre à jour les tests/contrôles concernés ;
12. mettre à jour ce README lorsqu'une architecture importante change.

---

# 26. Prochaine étape avant production publique

Checklist recommandée :

- [ ] créer une base Supabase de staging ;
- [ ] appliquer `0001_baaro_unified.sql` ;
- [ ] vérifier toutes les politiques RLS avec plusieurs utilisateurs ;
- [ ] tester les vues/likes avec propriétaire, autre utilisateur et utilisateur bloqué ;
- [ ] tester profil/recherche/réglages ;
- [ ] tester N'Ko en RTL ;
- [ ] valider les traductions Bozo, Dogon et Soninké avec des locuteurs ;
- [ ] configurer R2 ;
- [ ] déployer et tester le worker média ;
- [ ] configurer les secrets Vercel ;
- [ ] tester les paiements en environnement de test ;
- [ ] exécuter les contrôles sécurité ;
- [ ] exécuter les tests E2E ;
- [ ] réaliser un audit/pentest indépendant ;
- [ ] sauvegarder la base avant le passage production ;
- [ ] déployer progressivement avec surveillance et rollback.

---

## Licence / propriété

BAARO est un projet applicatif propriétaire. Les licences des bibliothèques et services tiers utilisés par le projet restent applicables.

---

**BAARO — une plateforme sociale internationale conçue pour évoluer.**

## 🎬 Studio vidéo — création photo, vidéo et texte

Le module **Vidéos** inclut un studio de création rapide directement dans l’application. Il permet de :

- créer une vidéo à partir d’une seule photo ;
- créer un diaporama à partir de plusieurs photos ;
- créer une vidéo à partir de texte seul ;
- créer un montage **mixte photos + vidéos** dans l’ordre choisi ;
- ajouter un texte en surimpression au montage ;
- choisir une durée par photo ;
- ajouter une musique de la bibliothèque ou importer son propre audio ;
- prévisualiser le résultat avant publication ;
- publier ensuite via le même pipeline R2 utilisé par les vidéos classiques.

Le montage rapide est rendu dans le navigateur avec `MediaRecorder` et `Canvas`. Les fichiers produits sont ensuite envoyés avec l’upload vidéo existant. Les traitements lourds (transcodage, sous-titres, highlights, etc.) restent délégués au worker vidéo/FFmpeg.

### Modes de création

| Mode | Entrées | Résultat |
|---|---|---|
| Vidéo | caméra ou fichier vidéo | vidéo publiée |
| Mix | 1+ photos et/ou vidéos | montage vertical avec texte/audio optionnels |
| Photos | 1 à 10 photos | diaporama animé |
| Texte | texte | vidéo typographique |

> Le mode **Mix** est le mode recommandé pour combiner une photo unique, plusieurs photos, des vidéos et du texte dans une même création.



## BAARO Economy

BAARO intègre un registre financier sans crypto pour les revenus créateurs et business : publicité, pourboires, abonnements, ventes, campagnes, parrainage et bonus. Le tableau **Revenus** affiche les soldes en attente, disponibles, réservés pour retrait et déjà payés. Les écritures financières sont serveur-authoritative, idempotentes et protégées par RLS; les demandes de retrait passent par une réserve avant paiement. Voir `ECONOMY.md`.

## Payment wiring (V20)

The canonical payment route is `POST /api/payments`. It authenticates the user, resolves payable amounts server-side, supports Stripe/CinetPay, and relies on `/api/webhooks` for final settlement. `api/wallet.js` is retained only as a compatibility alias and no longer exposes wallet/crypto operations.
