# BAARO v20 — Real Money Hardening

## Corrections applied before a real payment test

- CinetPay pay-in amounts are converted from BAARO internal minor units to XOF provider units.
- Stripe receives provider-compatible amounts; XOF is normalized as a zero-decimal provider currency while BAARO keeps internal minor units.
- Stripe and CinetPay webhooks convert provider amounts back to BAARO internal minor units before validation.
- Order, shop subscription and company subscription amounts are normalized and checked server-side before fulfillment.
- Every monetization product has an explicit fulfillment path or a grouped fulfillment path.
- Tips are real checkout intents with `send_tip`, `tips` records and server-authoritative creator earnings.
- Creator subscriptions create creator earnings through the economy ledger.
- Marketplace orders create merchant earnings idempotently when paid.
- Live tickets and paid training create organizer/host earnings.
- Ad revenue has a server-only bridge protected by `BAARO_AD_REVENUE_SECRET`.
- Creator payouts use a server payout endpoint and CinetPay transfer API when `CINETPAY_TRANSFER_TOKEN` is configured.
- CinetPay payout notifications are re-queried against CinetPay before completion/cancellation.
- Payout completion/cancellation calls the service-role ledger functions.
- Payouts are blocked until a creator payout profile is KYC-verified and not risk-blocked.
- Minimum cash-out remains enforced in the database and is shown in the UI.
- Payment return/success/cancel feedback is surfaced in the Economy UI.
- Economy/tip strings were added to all BAARO locales; product text can continue to be progressively translated by human reviewers.

## Required production secrets

- `CINETPAY_API_KEY`
- `CINETPAY_SITE_ID`
- `CINETPAY_TRANSFER_TOKEN` for automated Mobile Money payouts
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BAARO_AD_REVENUE_SECRET` if an external ad-delivery service sends creator revenue events
- Supabase server credentials
- Upstash Redis credentials in Vercel production

A real payment test must still be performed against a configured merchant account before public launch. Static checks cannot prove a provider account, KYC, webhook URL, settlement, or payout account is live.
