# Sécurité BAARO

## Portefeuille

- Les tables wallets, transactions et crypto_holdings sont en lecture seule côté client.
- Toute écriture passe par `/api/wallet` (service role).
- Actions de gain whitelistées + plafond quotidien.
- Âge minimum du compte + restriction multi-comptes.

## Auth

- Comptes anonymes possibles.
- Turnstile (CAPTCHA) à l'entrée.
- Limite de comptes par appareil.
