BAARO — plateforme sociale internationale nouvelle génération
BAARO est une plateforme sociale internationale conçue pour réunir dans une même expérience le réseau social, la vidéo, la messagerie, les communautés, la découverte, l’intelligence artificielle, les outils créateurs, le commerce et les fonctions de confidentialité.
Le projet vise quatre priorités :
Rapidité et fiabilité — architecture Web et mobile, cache, prise en charge des réseaux faibles, traitement asynchrone des médias et stockage/CDN adaptés.
Sécurité et confidentialité — Supabase Row Level Security (RLS), UUID utilisateur canonique, chiffrement côté client pour la messagerie et séparation des secrets.
Internationalisation — interface multilingue, prise en charge du N’Ko et des langues ouest-africaines, adaptation progressive des contenus aux régions.
Innovation — IA, recommandations, traitement vidéo, traduction, mode hors ligne, économie créateur et modules extensibles.
Règles de maintenance de la base
Ne jamais appliquer une migration SQL sans avoir compris son contenu, ses dépendances et l’état réel de la base cible.
Avant de remplacer une policy existante, utiliser DROP POLICY IF EXISTS avec le nom et la table exacts, puis recréer la policy après vérification.
Ne jamais restaurer, recréer ou appliquer une migration supprimée volontairement sans décision explicite du mainteneur.
Une modification SQL doit être sauvegardée, revue et testée sur un environnement isolé avant toute intervention en production.
🎵 BAARO Sounds — bibliothèque audio et gestion des droits
BAARO Sounds est destiné à alimenter le Video Studio avec des sons maliens, africains et internationaux. Le catalogue doit distinguer les créations originales, les morceaux proposés par les créateurs, les sons traditionnels et les contenus couverts par une licence.
Principe de sécurité juridique
Un son tiers n’est pas libre simplement parce qu’il est local, traditionnel ou disponible sur Internet. Les métadonnées du catalogue doivent permettre de conserver notamment :
le titulaire des droits (rights_holder) ;
le code et le nom de licence (license_code, license_name) ;
l’obligation éventuelle d’attribution ;
l’autorisation d’utilisation commerciale ;
l’autorisation de remix ;
les territoires autorisés ;
la source et la provenance ;
le statut de validation (pending, approved, rejected, disabled) ;
la date de dernière vérification des droits.
Les utilisateurs peuvent proposer un son au moyen de submit_baaro_sound(...). Une proposition doit rester en attente tant qu’elle n’a pas été examinée. La publication dans le catalogue public doit être réservée à un rôle d’administration autorisé, vérifié côté serveur ou dans une fonction sécurisée.
Catégories du catalogue
BAARO Original : créations dont BAARO détient ou contrôle les droits nécessaires.
Créateur : morceau fourni par un artiste avec déclaration et autorisation vérifiables.
Tradition & Culture : contenu culturel dont les droits applicables et ceux de l’enregistrement utilisé ont été vérifiés.
Sous licence : contenu acquis ou autorisé par contrat.
Domaine public / CC0 / CC BY : contenu uniquement classé ainsi après vérification de la licence et de ses conditions.
Utilisation dans le Video Studio
Le parcours prévu est le suivant :
rechercher un son ;
écouter un aperçu autorisé ;
consulter la licence et l’attribution éventuelle ;
sélectionner le son ;
l’utiliser dans une création photo, vidéo ou texte ;
conserver le son d’origine ou le couper lorsque le montage le permet.
Une sélection validée peut être comptabilisée par record_sound_usage(...) afin de mesurer la popularité du catalogue.
Important : BAARO ne doit pas importer, héberger ou distribuer de musique commerciale tierce sans autorisation. Pour les sons traditionnels ou locaux, la provenance et les droits attachés à l’enregistrement doivent être vérifiés. Le système technique facilite cette gestion ; il ne remplace pas une validation juridique locale ou internationale.
1. Architecture générale
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
          │ Auth/DB/RLS│     │    API     │     │     R2     │
          │ Realtime   │     │ orchestration│    │   médias  │
          └────────────┘     └─────┬──────┘     └────────────┘
                                    │
                                    ▼
                           ┌────────────────┐
                           │ Worker média   │
                           │ FFmpeg / IA    │
                           │ Cloud Run/etc. │
                           └────────────────┘
Technologies et services
Les technologies et services utilisés ou prévus dans l’architecture comprennent :
Frontend : React 18 + Vite.
Web/mobile : PWA + Capacitor Android.
Base de données : Supabase PostgreSQL.
Authentification : Supabase Auth.
Temps réel : Supabase Realtime.
Sécurité des données : Row Level Security (RLS) et fonctions PostgreSQL contrôlées.
API : fonctions serverless dans api/, selon la configuration de déploiement.
Stockage média : Cloudflare R2.
Traitements lourds : worker externe, notamment FFmpeg et services IA.
Appels : Daily et/ou WebRTC selon la configuration active.
Paiements : Stripe, CinetPay ou autres prestataires selon les pays et l’intégration effectivement activée.
Internationalisation : i18next et fichiers JSON de langues.
Règle concernant api/
Les évolutions du profil, des statistiques, des langues et des réglages ne doivent pas entraîner la création d’API concurrentes si les services frontend et Supabase existants couvrent déjà ces besoins. Les routes API existantes doivent être conservées et modifiées uniquement après audit de leurs dépendances, de leurs contrats et de leurs consommateurs.
Les routes de paiement, webhooks et traitements sensibles constituent des flux distincts : leur existence dans la documentation ne prouve pas à elle seule qu’ils sont correctement configurés ou déployés.
2. Accueil / Feed
Le Feed regroupe notamment :
publications texte, image et vidéo ;
likes et commentaires ;
partages et interactions sociales ;
sondages ;
Stories ;
pagination par curseur ;
temps réel ;
recommandations ;
récompenses créateur ;
upload média via le pipeline configuré.
Limite des vidéos dans le Feed
Les vidéos publiées dans le Feed sont limitées à 50 MB par les règles de l’interface ou du pipeline BAARO actuellement documentées. Cette limite doit être vérifiée dans le code d’upload et dans les limites du fournisseur avant d’être considérée comme une garantie serveur.
3. Vidéos
Le module Vidéos est distinct du Feed et s’appuie sur le pipeline média dédié.
Les fonctionnalités visées ou intégrées selon l’état du code peuvent comprendre :
vidéos longues ;
upload multipart ;
stockage R2 ;
miniatures ;
transcodage asynchrone ;
sous-titres ;
traduction ;
doublage ;
modération ;
extraction de caractéristiques ;
highlights ;
plan de montage assisté par IA ;
recommandations ;
signaux de visionnage ;
taux de complétion ;
relecture ;
signaux négatifs ;
monétisation créateur.
La limite de 50 MB du Feed ne doit pas être présentée comme une limite générale de l’onglet Vidéos. La taille maximale réellement acceptée dépend du code d’upload, du protocole utilisé, du worker, du stockage R2 et des limites des fournisseurs. Il faut la vérifier sur le parcours complet, et pas uniquement dans l’interface.
4. Stories
Les Stories sont temporaires et disposent d’un système d’engagement dédié.
Engagement du propriétaire
Selon les autorisations et les données effectivement disponibles, le propriétaire d’une Story peut consulter :
le nombre de vues ;
la liste des personnes ayant vu la Story ;
le nombre de likes ou réactions ;
la liste des personnes ayant réagi ;
les réponses ;
l’heure de consultation ou de réaction, lorsque cette information est enregistrée.
Confidentialité
Les listes nominatives de vues et de réactions doivent être réservées aux personnes autorisées, notamment au propriétaire du contenu. Les policies RLS et les fonctions sécurisées doivent appliquer ces restrictions côté base de données. Masquer une liste dans l’interface ne constitue pas une protection suffisante.
5. Publications et statistiques d’engagement
Les publications peuvent exposer des indicateurs tels que :
vues ;
likes ;
commentaires ;
partages ;
auteur ;
date de publication ;
média associé.
Les vues doivent être dédupliquées côté serveur ou base de données selon une règle documentée, afin qu’un simple rafraîchissement ne gonfle pas artificiellement les compteurs.
6. Profil BAARO
Le profil est conçu comme une page de présentation. La modification des informations personnelles est centralisée dans Réglages.
Statistiques du profil
Les indicateurs prévus comprennent :
publications ;
likes ;
abonnés ;
abonnements ;
amis.
La fonction Supabase get_profile_stats() est mentionnée comme point d’accès prévu à ces statistiques. Sa présence, ses permissions, ses performances et sa cohérence avec les tables réelles doivent être vérifiées dans le dépôt et sur l’environnement Supabase utilisé.
Recherche vers profil
La recherche peut afficher un aperçu comprenant :
avatar ;
nom ;
@handle ;
statistiques principales ;
accès au profil.
Le profil ouvert depuis la recherche est destiné à être consulté en lecture seule. La modification du profil doit rester centralisée dans Réglages, afin d’éviter plusieurs écrans concurrents modifiant les mêmes informations.
7. Recherche globale
La recherche BAARO vise à découvrir :
personnes ;
publications ;
communautés ;
débats ;
profils ;
contenus pertinents.
Les requêtes doivent être bornées, protégées par les contrôles d’accès Supabase et exclure les utilisateurs bloqués lorsque la règle produit l’exige. Les résultats ne doivent jamais contourner les règles de visibilité appliquées au contenu.
8. Messagerie
Le module de messagerie vise à réunir :
chiffrement de bout en bout (E2E) côté client ;
réactions ;
réponses ;
favoris ;
messages épinglés ;
recherche ;
indicateur de frappe ;
accusés de livraison ;
accusés de lecture ;
messages éphémères ;
images, vidéos et fichiers ;
messages vocaux ;
appels audio/vidéo ;
temps réel ;
multi-appareils ;
signalement ;
fonctions IA : résumé, réponse intelligente, traduction, reformulation et extraction de tâches.
Les clés privées ne doivent pas être exposées au serveur lorsque le mécanisme E2E côté client est utilisé. Les comptes anonymes ne doivent pas accéder à la messagerie si les règles produit l’interdisent ; cette restriction doit être contrôlée côté serveur, pas uniquement dans l’interface.
La mention « E2E » ne suffit pas à prouver la sécurité du système : le cycle de vie des clés, la vérification des appareils, les sauvegardes, les métadonnées et les scénarios de récupération doivent être documentés et testés.
9. Communautés
Le système communautaire vise à prendre en charge :
groupes publics et privés ;
catégories ;
canaux ;
membres ;
rôles ;
invitations ;
modération ;
bannissement ;
signalement ;
découverte ;
événements et espaces communautaires.
Les opérations sensibles doivent être protégées par RLS et par des fonctions serveur ou PostgreSQL correctement autorisées. Les rôles et permissions ne doivent pas être déterminés uniquement par des valeurs envoyées par le client.
10. IA et BAARO Future Nexus
BAARO est organisé pour accueillir une couche d’intelligence transverse, notamment :
assistant IA ;
moteur d’intention ;
recommandations ;
traduction ;
mémoire privée ;
Trust Graph ;
Trust ID ;
détection anti-arnaque ;
outils créateur ;
commerce ;
automatisations ;
synchronisation hors ligne ;
fonctionnalités expérimentales activables progressivement.
Les actions IA sensibles doivent demander une confirmation explicite lorsqu’elles peuvent modifier un compte, une donnée ou déclencher une opération importante. Les clés des fournisseurs IA doivent rester côté serveur.
11. Réglages — centre de contrôle BAARO
Les Réglages constituent le point central de modification du profil et des préférences.
Compte et profil
nom et prénom ;
date de naissance ;
bio ;
avatar et photos ;
handle ;
pays ;
localisation ;
e-mail et téléphone ;
liens de profil.
Performance
préchargement intelligent ;
mode batterie ;
mode réseau faible ;
économie de données ;
cache local ;
lecture automatique des vidéos ;
synchronisation hors ligne ;
réduction des animations ;
texte agrandi.
IA
région IA ;
suggestions IA ;
traduction automatique ;
traduction et sous-titres média ;
préférence pour les traitements privés lorsque disponibles.
Confidentialité et sécurité
profil privé ;
appareils ;
biométrie selon la plateforme ;
notifications ;
contrôle des données ;
export ;
gestion des sessions et options de sécurité.
Les options affichées doivent correspondre à des fonctions réellement opérationnelles. Une préférence enregistrée dans l’interface ne doit pas être présentée comme une protection effective tant que son application côté serveur ou appareil n’est pas vérifiée.
12. Langues et N’Ko
BAARO utilise un système i18n basé sur des fichiers JSON dans locales/.
Langues préparées dans le projet
Français — fr
Anglais — en
Arabe — ar
N’Ko — nqo
Bozo — boz
Dogon — dog
Soninké — snk
Bamanankan — bm
D’autres langues peuvent être ajoutées progressivement. La présence d’un fichier de langue ne garantit pas que toutes les chaînes de l’application sont traduites ou validées.
N’Ko et RTL
Le mode nqo vise à permettre l’affichage de l’interface en N’Ko avec une direction RTL (droite vers gauche). Il faut tester les composants, icônes, formulaires, menus, nombres, médias et textes mixtes afin d’éviter les inversions de mise en page.
Les traductions Bozo, Dogon et Soninké doivent être progressivement vérifiées par des locuteurs compétents.
Important : un fichier de langue présent dans le dépôt ne signifie pas que chaque phrase métier est traduite à 100 %. Toute nouvelle chaîne doit être ajoutée aux langues prises en charge et contrôlée avant de déclarer une langue entièrement localisée.
13. Internationalisation technique
Structure indicative des fichiers :
i18n.js
locales/fr.json
locales/en.json
locales/ar.json
locales/nqo.json
locales/boz.json
locales/dog.json
locales/snk.json
locales/bm.json
Le code doit éviter les textes utilisateur codés en dur dans les composants lorsque ces chaînes sont destinées à être traduites.
Pour ajouter une fonctionnalité multilingue :
ajouter une clé de traduction ;
l’ajouter aux fichiers de langues pris en charge ;
utiliser i18next / react-i18next dans le composant ;
tester LTR et RTL ;
vérifier les textes longs et les caractères Unicode.
14. Stockage média Cloudflare R2
Les gros fichiers média ne doivent pas transiter inutilement par Supabase Storage ou la mémoire d’une fonction serverless.
Variables serveur indicatives :
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=baaro-media
R2_PUBLIC_BASE_URL=
Les clés R2 sont strictement réservées au serveur. Elles ne doivent jamais être préfixées par VITE_, intégrées au bundle frontend ou exposées dans les journaux.
15. Worker vidéo
Le worker externe traite les opérations lourdes :
récupération et validation du job ;
lecture du média depuis R2 ;
traitement FFmpeg, Whisper ou IA selon le job ;
génération des artefacts ;
écriture dans R2 ;
mise à jour de l’état du job.
Variables serveur indicatives :
BAARO_MEDIA_PROCESSOR_URL=
BAARO_WORKER_SECRET=
BAARO_WORKER_ID=
Le worker peut être déployé sur Cloud Run ou une infrastructure équivalente capable d’exécuter des traitements longs.
Principe d’architecture : Vercel orchestre ; le worker traite. Les appels worker doivent être authentifiés, idempotents et protégés contre la répétition ou la falsification des jobs.
16. Base de données et migrations SQL
État et règle de maintenance
Les migrations SQL historiques ont été volontairement retirées du dépôt. Cette absence est une décision de maintenance et de sécurité : elle ne doit pas être interprétée comme une invitation à recréer automatiquement un fichier de migration unifié.
Ne pas restaurer, recréer ou appliquer 0001_baaro_unified.sql sans instruction explicite du mainteneur. Ne pas supposer qu’un schéma documenté correspond au schéma actuellement déployé dans Supabase.
La documentation seule ne permet pas de certifier :
les tables réellement présentes dans le projet Supabase ;
les colonnes et contraintes actuellement déployées ;
les policies RLS actives ;
les fonctions RPC disponibles ;
les permissions EXECUTE ;
les triggers, index et extensions ;
les écarts entre staging et production.
Procédure obligatoire avant toute modification SQL
identifier précisément le projet et l’environnement ciblés ;
obtenir un état vérifiable du schéma actuel ;
examiner les dépendances et les consommateurs applicatifs ;
préparer une sauvegarde et un plan de retour arrière ;
tester la modification sur une base isolée ;
examiner les policies existantes ; avant de remplacer une policy, utiliser DROP POLICY IF EXISTS avec son nom exact ;
vérifier les permissions avec plusieurs rôles et plusieurs utilisateurs ;
ne déployer en production qu’après validation explicite.
Une policy ne doit pas être supprimée sans comprendre les accès qu’elle protège. DROP POLICY IF EXISTS évite une erreur si la policy n’existe pas, mais ne garantit pas que la policy de remplacement est correcte.
17. Identité utilisateur
L’identité canonique est l’UUID de :
auth.users.id
Les tables métier doivent utiliser cet UUID comme référence relationnelle lorsque le modèle de données le prévoit.
Le nom, l’e-mail, le téléphone et le handle sont des attributs de l’utilisateur ; ils ne doivent pas remplacer l’UUID comme clé relationnelle. Les contrôles d’identité doivent utiliser l’utilisateur authentifié (auth.uid()) et non un identifiant fourni librement par le client.
18. Sécurité
Les principes de sécurité comprennent :
RLS sur les données sensibles ;
contrôle de auth.uid() ;
fonctions PostgreSQL limitées et correctement autorisées ;
séparation des secrets serveur/client ;
clés R2 côté serveur uniquement ;
opérations financières côté serveur ;
contrôle des blocages et de la visibilité ;
rate limiting lorsque prévu ;
journalisation des événements de sécurité ;
protection des appareils ;
scanner de secrets ;
contrôles de sécurité CI ;
chiffrement E2E côté client pour les contenus de messagerie concernés.
Principe absolu
Le frontend n’est jamais une frontière de sécurité. Toute autorisation importante doit être vérifiée côté serveur ou dans Supabase. Les contrôles d’interface améliorent l’expérience utilisateur, mais ne remplacent ni RLS ni l’autorisation serveur.
19. Installation locale
Prérequis
version de Node.js compatible avec package.json ;
npm ;
accès au projet Supabase pour les fonctions qui en dépendent ;
compte Cloudflare R2 si le stockage média est activé ;
variables d’environnement adaptées à l’environnement local.
Installation
npm install
cp .env.example .env.local
npm run dev
Build et prévisualisation
npm run build
npm run preview
Les commandes exactes doivent rester cohérentes avec les scripts réellement déclarés dans package.json.
20. Vérifications du projet
Les scripts de contrôle doivent être exécutés à partir des commandes réellement déclarées dans package.json. Les commandes ci-dessous sont celles documentées pour le projet ; vérifier leur présence avant de les utiliser :
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
Avant un déploiement, exécuter au minimum les contrôles de production, de sécurité, de secrets et le build. Un contrôle statique ne prouve pas à lui seul que les services distants, les policies déployées ou les paiements en production fonctionnent correctement.
21. Déploiement
Frontend et API
Le frontend et les fonctions sous api/ sont prévus pour un déploiement sur Vercel lorsque la configuration du projet le prévoit. Vérifier les routes, variables et paramètres de build de l’environnement cible.
Supabase
Configurer Auth, PostgreSQL, RLS et Realtime selon le schéma réellement géré dans l’environnement. Ne pas appliquer de migration supprimée ou reconstruite sur la seule base de ce README.
Médias
Configurer Cloudflare R2, les permissions d’accès et les URL publiques ou signées adaptées au niveau de confidentialité des fichiers.
Worker
Déployer le worker sur Cloud Run ou une plateforme équivalente, puis renseigner les secrets côté serveur :
BAARO_MEDIA_PROCESSOR_URL=
BAARO_WORKER_SECRET=
BAARO_WORKER_ID=
Android
Le projet utilise Capacitor. Après une modification du frontend :
npm run build
npx cap sync android
Puis ouvrir ou compiler le projet Android avec l’outillage Android configuré. Une modification du code Web intégrée dans l’application native nécessite de reconstruire et distribuer une nouvelle version de l’application, sauf mécanisme de mise à jour explicitement configuré et autorisé.
22. Variables d’environnement
Utiliser .env.example comme référence, puis comparer chaque variable avec le code qui la lit et l’environnement de déploiement.
Règle de sécurité
Les variables destinées au frontend peuvent utiliser le préfixe VITE_ uniquement si leur valeur est publique.
Les éléments suivants doivent rester côté serveur :
clés R2 ;
clés secrètes Stripe ou autres prestataires ;
secrets du worker ;
clés privées des fournisseurs IA ;
secrets de webhook ;
FIREBASE_SERVICE_ACCOUNT (JSON du compte de service Firebase pour les notifications push).
Ne jamais placer un secret dans une variable VITE_.
Pour recevoir des notifications de nouveaux messages lorsque BAARO est en arrière-plan ou fermé, l’application native doit être associée au projet Firebase correspondant, avec le fichier de configuration Android approprié (android/app/google-services.json) et un compte de service configuré côté serveur, si le code de notification utilise cette méthode. Les permissions de notification doivent être accordées sur le téléphone. Le contenu des messages chiffrés ne doit pas être inclus dans les notifications.
23. Organisation du dépôt
Arborescence indicative à maintenir synchronisée avec les fichiers réellement présents :
BAARO/
├── .github/workflows/         # CI et automatisations
├── android/                   # projet Capacitor Android
├── api/                       # fonctions API serverless
├── docs/                      # documentation, politiques et conformité
├── locales/                   # traductions i18n
├── native-plugins/            # plugins natifs
├── public/                    # PWA, icônes, sons et branding
├── scripts/                   # contrôles production / sécurité / E2E
├── src/
│   ├── app/                   # App, MainShell, tabs
│   ├── components/            # UI partagée
│   ├── contexts/              # contextes applicatifs
│   ├── features/              # modules métier
│   │   ├── ai/
│   │   ├── auth/
│   │   ├── contacts/
│   │   ├── debates/
│   │   ├── economy/
│   │   ├── feed/
│   │   ├── friends/
│   │   ├── messaging/
│   │   ├── shop/
│   │   ├── stories/
│   │   ├── videos/
│   │   ├── settings/
│   │   ├── profile/
│   │   ├── offline/
│   │   ├── guide/
│   │   ├── future/
│   │   └── innovation/
│   ├── hooks/                 # hooks globaux
│   ├── lib/                   # logique partagée
│   ├── pages/
│   ├── services/              # services applicatifs
│   ├── store/
│   ├── main.jsx
│   ├── supabaseClient.js
│   └── theme.js
├── supabase/
│   ├── config.toml
│   └── functions/             # Edge Functions, si présentes
├── worker/                    # traitements média lourds
├── capacitor.config.json
├── vite.config.js
├── package.json
└── .env.example
Ne pas considérer cette arborescence comme un inventaire garanti : les dossiers, fichiers et alias doivent être vérifiés dans le dépôt avant toute modification ou suppression.
Principes d’architecture à retenir
Identité : auth.users.id est l’UUID canonique.
Médias : réutiliser le pipeline d’upload existant au lieu de créer des chemins concurrents.
Messagerie : conserver un module de messagerie cohérent et éviter les implémentations parallèles.
IA : garder les prompts sensibles et les secrets côté serveur.
Compatibilité : conserver les alias et ré-exports utilisés par le code tant que leurs consommateurs n’ont pas été migrés et testés.
24. Philosophie produit
BAARO ne cherche pas seulement à reproduire les fonctions des réseaux sociaux existants. Le projet vise à réunir dans une même infrastructure :
Social + Video + Messaging + Community + AI + Creator Economy + Commerce + Discovery + Offline + Local Languages.
L’objectif est une plateforme :
internationale ;
rapide ;
accessible avec des réseaux faibles ;
adaptée au mobile ;
respectueuse de la confidentialité ;
ouverte à plusieurs langues et écritures ;
extensible par modules ;
capable d’évoluer sans réécrire toute son infrastructure.
25. Règles de développement BAARO
Avant d’ajouter une fonctionnalité :
vérifier si elle existe déjà ;
réutiliser les services et hooks existants ;
ne pas créer un deuxième système concurrent pour la même donnée ;
respecter l’UUID utilisateur canonique ;
protéger les opérations sensibles côté serveur ;
ajouter les traductions ;
tester sur mobile et sur le Web ;
tester le mode réseau faible lorsque la fonctionnalité utilise beaucoup de données ;
respecter les policies RLS existantes ;
ne pas exposer de secrets ;
mettre à jour les tests et contrôles concernés ;
mettre à jour ce README lorsqu’une architecture importante change ;
examiner les effets sur les autres modules avant de modifier une API, un hook partagé ou un contrat de données ;
pour SQL, inspecter l’état réel de la base et obtenir une validation avant toute intervention.
26. Prochaine étape avant une production publique
Checklist de validation :
[ ]
vérifier les fonctionnalités annoncées par rapport au code réellement présent ;
[ ]
créer ou utiliser un environnement Supabase de staging isolé ;
[ ]
inspecter le schéma et les policies existantes sans appliquer de migration inconnue ;
[ ]
tester les accès RLS avec plusieurs utilisateurs et rôles ;
[ ]
tester vues et likes avec le propriétaire, un autre utilisateur et un utilisateur bloqué ;
[ ]
tester profil, recherche et réglages ;
[ ]
tester N’Ko en RTL ;
[ ]
faire valider les traductions Bozo, Dogon et Soninké par des locuteurs ;
[ ]
configurer R2 et vérifier les règles d’accès ;
[ ]
déployer et tester le worker média ;
[ ]
configurer les secrets serveur ;
[ ]
tester les paiements en environnement de test ;
[ ]
exécuter les contrôles de sécurité et les tests E2E ;
[ ]
vérifier les notifications en arrière-plan ;
[ ]
réaliser un audit ou pentest indépendant ;
[ ]
sauvegarder la base avant toute intervention de production ;
[ ]
préparer une surveillance, une procédure de rollback et un plan de réponse aux incidents.
27. BAARO Sounds et Studio vidéo
Le Video Studio vise à permettre la création rapide de contenus photo, vidéo et texte :
créer une vidéo à partir d’une photo ;
créer un diaporama à partir de plusieurs photos ;
créer une vidéo typographique à partir de texte ;
créer un montage mixte photos et vidéos dans l’ordre choisi ;
ajouter un texte en surimpression ;
choisir une durée par photo ;
ajouter un son du catalogue BAARO Sounds ou importer un audio dont l’utilisateur détient les droits ;
prévisualiser le résultat avant publication ;
publier via le pipeline vidéo existant.
Le montage rapide peut être rendu dans le navigateur avec MediaRecorder et Canvas lorsque les formats et capacités du navigateur le permettent. Les fichiers produits doivent ensuite passer par le parcours d’upload vidéo existant. Les traitements lourds restent délégués au worker média.
Mode
Entrées
Résultat attendu
Vidéo
caméra ou fichier vidéo
vidéo publiée
Mix
une ou plusieurs photos et/ou vidéos
montage vertical avec texte/audio optionnels
Photos
une à dix photos
diaporama animé
Texte
texte
vidéo typographique
Le mode Mix est le mode polyvalent destiné à combiner photos, vidéos et texte dans une même création.
28. BAARO Economy
BAARO Economy vise à gérer les revenus créateurs et business sans crypto-actif : publicité, pourboires, abonnements, ventes, campagnes, parrainage et bonus.
Le tableau Revenus peut présenter les montants en attente, disponibles, réservés pour retrait et déjà payés. Les écritures financières doivent être autoritatives côté serveur, idempotentes et protégées par les permissions appropriées. Une demande de retrait doit réserver les fonds avant l’exécution du paiement.
Les pourcentages de partage, RPC, tables et statuts mentionnés dans les documents d’économie constituent des règles à vérifier dans le code et dans la base réellement déployée. La documentation ne prouve pas que ces éléments sont actifs.
Voir docs/ECONOMY.md si ce fichier est présent dans la version du dépôt.
29. Paiements et webhooks
Les routes de paiement doivent être documentées à partir des fichiers réellement présents dans api/. Si POST /api/payments est la route canonique de la version déployée, elle doit authentifier l’utilisateur, calculer les montants côté serveur et ne jamais faire confiance à un montant fourni par le navigateur.
Les webhooks doivent vérifier la signature du prestataire, gérer l’idempotence et confirmer le règlement uniquement après validation du prestataire. Les routes de compatibilité ne doivent pas réintroduire de fonctionnalités wallet ou crypto supprimées.
La présence d’un nom de route dans ce README ne garantit pas son existence ni son activation en production. Vérifier le code, les variables d’environnement, les webhooks configurés chez le prestataire et les tests de bout en bout.
Licence et propriété
BAARO est un projet applicatif propriétaire. Les licences des bibliothèques, composants, modèles, contenus audio et services tiers restent applicables. Chaque contenu importé ou distribué doit disposer des droits nécessaires.
BAARO — une plateforme sociale internationale conçue pour évoluer.
