# BAARO 2.0 v11 — Messaging, Calls & Live hardening

## Changes
- Private-message participant validation is enforced in PostgreSQL.
- Message identity fields cannot be rewritten after insertion.
- Conversations cannot be created with the same user on both sides.
- Conversation pairs are canonicalized to avoid reversed duplicates.
- Call creation is tied to the two members of the conversation.
- Incoming Daily tokens require the authenticated callee + a valid ringing call ID.
- Call endpoint has rate limiting and uses BAARO CORS.
- Call status transitions are constrained.
- Realtime publication includes calls.

## Migration
Apply `supabase/migrations/017_messaging_calls_integrity.sql` after migration 016.

## Daily
The client must pass `callId` when requesting a join token. Older clients that only send `roomName` will now be rejected by design.
