# BAARO Monetization v19

## Implemented product layer

- Premium: 1,500 FCFA/month. Verification remains independent from payment.
- Tips: 100 / 500 / 1,000 FCFA and variable amounts through the server ledger.
- Post boosts: 24h campaigns with paid boost separated from organic ranking.
- Sponsored polls: sell reach/responses/clicks; never guarantee a fixed number of votes.
- VIP groups / close friends: 1,000 FCFA/month, platform share configurable.
- Animated cosmetics/reactions: 6-pack at 250 FCFA.
- BAARO Pro merchants: 5,000 FCFA/month.
- Local ads: radius targeting, budget and measurable objectives.
- Service bookings: commission-ready booking state machine with refunds/disputes/no-show states.
- API / white-label: Starter plan at 49 USD reference, metered quota and key storage model.
- Live tickets and paid training/replay.
- Closed-loop BAARO Credits: usable only for BAARO features; no cash-out or general transfer.
- Affiliate attribution: commission ledger with reversal/block states.
- AI paid usage: daily usage ledger and paid packs.
- Job profile boost: 2,000 FCFA / 7 days.
- Premium profile-view mode with configurable retention.
- B2B insights requests require aggregation thresholds and controlled fulfillment.

## Financial safety

All financial/entitlement mutations are server-authoritative. Client RLS only exposes owner-readable state. Checkout intents are priced from the server product catalog, and fulfillment requires `service_role` after a provider has independently verified payment.

`api/` is part of the hardened payment surface in v20/v21. Payment initiation, payout initiation and provider callbacks are server-side only; no secrets are exposed to the client.

## Payment activation

The ZIP creates the payment/entitlement foundation and checkout intents. Provider activation still requires a configured payment checkout/webhook path in the deployment environment. Do not mark a payment as paid from the browser.

## Credits compliance boundary

BAARO Credits are deliberately **closed-loop**. They are not a bank balance, cannot be withdrawn as cash, and are not intended to represent redeemable electronic money. Any future cash-like wallet, transferability, redemption, or broad merchant acceptance requires a separate legal/regulatory review and licensed payment/e-money partner where applicable.

## V20 — Payment wiring hardening

- `/api/payments` is the canonical payment-initiation endpoint.
- `/api/wallet.js` is now a compatibility alias only; wallet/crypto actions are not exposed.
- Payment amounts for orders, shops and companies are resolved server-side from Supabase.
- Monetization checkout intents are authenticated, rate-limited and provider-settled only after webhook confirmation.
- Stripe Checkout and CinetPay initialization are wired to the same checkout intent model.
- Provider callbacks verify expected amount/currency before settlement.
- Failed/expired provider attempts move pending monetization intents out of the payable state.
- BAARO Credits are closed-loop units: no cash-out and no peer transfer.
- The migration decommissions legacy wallet/crypto storage in the final database state.
- Creator payout execution is gated by `creator_payout_profiles.kyc_status=verified`, `payout_verified=true`, normal risk status, minimum cashout and a valid destination. The ledger reserves funds first; `/api/payouts` starts the provider transfer and `/api/payout-webhook` verifies the provider result before `complete_economy_payout` or `cancel_economy_payout`.


## V21 — Creator Rewards

- Creator Rewards points are restored as a separate, non-cash engagement layer.
- Server-only `award_creator_points` records qualified events with idempotency.
- Points have tiers (starter, rising, creator, pro, elite) and are visible in the Economy dashboard.
- Points cannot be withdrawn, transferred or converted to XOF.
- Cash creator revenue remains in the audited XOF economy ledger and follows KYC/payout controls.
- The creator revenue catalogue remains modular; not every product is required for launch. The launch-critical path is: Tips, Creator Subscriptions, Ads revenue, Marketplace revenue, Live/Training revenue, Creator Rewards points, and verified payout.
