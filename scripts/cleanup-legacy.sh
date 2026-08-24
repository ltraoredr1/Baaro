#!/usr/bin/env bash
# Nettoyage fichiers legacy / doublons BAARO
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== BAARO cleanup legacy =="

# Doublons shop (source de vérité = src/features/shop/)
rm -fv src/components/ShopFeature.jsx 2>/dev/null || true
rm -fv src/components/ShopRegistrationForm.jsx 2>/dev/null || true

# Fichiers racine déplacés sous src/ ou inutiles en prod
rm -fv paymentProvider.js 2>/dev/null || true
rm -fv package.json.bak 2>/dev/null || true

# PhoneAuth à la racine : ne supprimer QUE si une copie features existe
if [ -f src/features/auth/PhoneAuth.jsx ] || [ -f src/components/PhoneAuth.jsx ]; then
  rm -fv PhoneAuth.jsx 2>/dev/null || true
else
  echo "SKIP PhoneAuth.jsx (pas de doublon détecté — déplace-le manuellement si besoin)"
fi

echo "OK. Vérifie git status puis commit."
