BAARO 2.0 v14 — Notifications & Fondation Mobile

Fonctionnalités incluses

- Gestion des notifications Web Push avec prise en charge de "push" et "notificationclick" dans le Service Worker.
- Système de préférences de notifications avec table Supabase et protection RLS.
- Nettoyage côté serveur des anciens tokens Web Push devenus invalides.
- Helper client pour consulter et modifier les préférences de notifications.
- Helper pour supprimer les anciennes souscriptions Web Push du navigateur.
- Mise à jour de la version du cache afin d'éviter l'utilisation d'anciens fichiers du Service Worker.
- Système de notifications applicatives Supabase basé sur :
  - "notification_id" : identifiant unique de la notification ;
  - "user_id" : utilisateur destinataire ;
  - "actor_id" : utilisateur à l'origine de l'action ;
  - "type" : type de notification ;
  - "message" : contenu de la notification ;
  - "source_id" : identifiant de la ressource concernée ;
  - "read" et "read_at" : état de lecture ;
  - "created_at" : date de création.
- Notifications en temps réel via Supabase Realtime.
- Affichage, lecture, suppression individuelle et suppression globale des notifications dans l'interface BAARO.
- Isolation des notifications par utilisateur grâce aux politiques RLS.

Supabase

Fondation des notifications

La migration suivante constitue la fondation du système de préférences et des notifications :

supabase/migrations/020_notifications_foundation.sql

Elle doit être exécutée après les migrations précédentes nécessaires au fonctionnement de BAARO.

Migration finale des notifications

La structure finale de la table "notifications" utilise désormais :

notification_id → identifiant unique de la notification
user_id         → destinataire
actor_id        → auteur de l'action
type            → type de notification
message         → message
source_id       → ressource associée
read            → notification lue ou non
read_at         → date de lecture
created_at      → date de création

La colonne historique "id" utilisée comme destinataire a été supprimée de la structure finale.

Le composant "NotificationDrawer" utilise désormais exclusivement "user_id" comme destinataire et "notification_id" comme identifiant de notification.

Notifications automatiques

Les notifications liées aux abonnements ("follow") sont générées côté Supabase.

Lorsqu'un utilisateur commence à suivre un autre utilisateur :

Utilisateur A
     ↓
  suit
     ↓
Utilisateur B
     ↓
notification
     ↓
user_id = B
actor_id = A
type = follow

Le destinataire ne peut consulter que ses propres notifications grâce au RLS.

Temps réel

Supabase Realtime permet de recevoir automatiquement :

- les nouvelles notifications ;
- les modifications d'une notification ;
- la suppression d'une notification.

Le client utilise un canal propre à chaque utilisateur et filtre les événements avec :

user_id = utilisateur connecté

Web Push

Le Web Push permet d'envoyer des notifications même lorsque l'application Web n'est pas au premier plan.

Le Service Worker gère notamment :

- la réception des notifications "push" ;
- l'affichage de la notification ;
- l'événement "notificationclick" ;
- la navigation vers l'application lors d'un clic.

Sécurité

L'envoi réel des Web Push nécessite un service côté serveur utilisant des identifiants VAPID.

La clé privée VAPID ne doit jamais être placée dans le code Vite/client.

Elle doit rester exclusivement côté serveur.

Android et iOS

Pour les applications natives Android/iOS utilisant Capacitor, utiliser le plugin :

@capacitor/push-notifications

Les tokens natifs doivent être stockés séparément des souscriptions Web Push.

Exemple :

platform = android

ou :

platform = ios

La structure Web Push du navigateur ne doit pas être mélangée avec les tokens natifs Android/iOS.

Déconnexion

Lorsqu'un utilisateur se déconnecte :

1. supprimer ou invalider la souscription Web Push du navigateur ;
2. supprimer le token correspondant lorsque cela est nécessaire ;
3. conserver les notifications applicatives Supabase appartenant à l'utilisateur ;
4. empêcher toute réception future destinée à l'ancien utilisateur sur cet appareil.

Nettoyage des anciens tokens

Un mécanisme côté serveur permet de supprimer les tokens Web Push devenus invalides.

Ce nettoyage doit être effectué sans exposer les informations sensibles au client.

Validation avant déploiement

Exécuter dans l'ordre :

npm install --package-lock-only --ignore-scripts

Puis :

npm ci

Puis :

npm run check:lock

Puis :

npm run build

Le build doit terminer sans erreur.

Tests fonctionnels

Avant la mise en production, vérifier :

Notifications Web Push

- autorisation de notification ;
- refus de permission ;
- comportement lorsque l'application est au premier plan ;
- réception lorsque l'application est en arrière-plan ;
- affichage correct de la notification ;
- clic sur la notification ;
- navigation vers la bonne page.

Notifications BAARO

- création d'une notification ;
- affichage dans le tiroir des notifications ;
- compteur des notifications non lues ;
- marquage individuel comme lu ;
- marquage de toutes les notifications comme lues ;
- suppression individuelle ;
- suppression de toutes les notifications ;
- réception en temps réel.

Sécurité

Vérifier qu'un utilisateur ne peut :

- lire les notifications d'un autre utilisateur ;
- modifier les notifications d'un autre utilisateur ;
- supprimer les notifications d'un autre utilisateur.

Déconnexion

Vérifier :

- suppression de la souscription/token approprié ;
- absence de notifications envoyées à l'ancien compte ;
- reconnexion avec un autre compte sur le même appareil.

Nettoyage

Vérifier que les anciens tokens invalides sont correctement supprimés par le processus serveur.

État attendu

À la fin de cette étape, BAARO dispose d'une architecture de notifications séparant clairement :

                    BAARO
                      │
          ┌───────────┴───────────┐
          │                       │
   Notifications BAARO       Notifications Push
       Supabase                  Web Push
          │                       │
     Realtime + RLS          Service Worker
          │                       │
          │                Serveur VAPID
          │
          └───────────┬───────────┘
                      │
                Utilisateur

Les notifications applicatives, le Web Push et les notifications natives Android/iOS restent ainsi séparés afin de faciliter la maintenance, la sécurité et l'évolution future de BAARO.
