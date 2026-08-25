# BAARO 2.0 v14 — Notifications & Mobile Foundation

## Included
- Web Push `push` and `notificationclick` handling in the service worker.
- Notification preference table with RLS.
- Server-only cleanup function for stale push tokens.
- Client helper for reading/updating preferences.
- Browser subscription cleanup helper.
- Cache version bump to prevent stale service-worker assets.

## Supabase
Run `supabase/migrations/020_notifications_foundation.sql` after the previous migrations.

## Production
Web Push delivery still requires a server-side Web Push sender using VAPID credentials. Never expose the VAPID private key to Vite/client code.

For native Android/iOS push, use the Capacitor Push Notifications plugin and persist native device tokens with a platform value such as `android` or `ios`. Keep this separate from the Web Push subscription format.

## Validation
Before deployment:
1. `npm install --package-lock-only --ignore-scripts`
2. `npm ci`
3. `npm run check:lock`
4. `npm run build`
5. Verify push permission, foreground behavior, background push, click navigation, logout/token removal, and stale-token cleanup.
