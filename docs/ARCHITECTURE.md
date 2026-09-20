# Architecture BAARO

## Stack principale

- Frontend : React + Vite + Tailwind
- Backend : Supabase (Postgres + Auth + Realtime + Storage)
- API Serverless : Vercel Functions
- Live : Daily.co
- IA : Claude (via proxy serverless)
- Mobile : Capacitor (Android / iOS)

## Principales briques

- Portefeuille de points + BARO Coin
- Débats live
- Messagerie chiffrée
- Fil d'actualité + Stories
- Mode hors-ligne (Nearby)

#Notification:
notifications
├── notification_id  uuid        PK
├── user_id          uuid        NOT NULL → profiles.id
├── actor_id         uuid        NULL → profiles.id
├── type             text        DEFAULT 'general'
├── message          text        NOT NULL
├── source_id        uuid        NULL
├── read             boolean     DEFAULT false
├── read_at          timestamptz NULL
└── created_at       timestamptz DEFAULT now()
