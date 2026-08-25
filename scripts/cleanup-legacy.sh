#!/usr/bin/env bash
# BAARO — Phase 1 : nettoyage legacy / doublons
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== BAARO cleanup Phase 1 =="

mkdir -p docs/archive docs/versions supabase/legacy

# Doublons / fichiers morts
rm -fv src/components/ShopFeature.jsx 2>/dev/null || true
rm -fv src/components/ShopRegistrationForm.jsx 2>/dev/null || true
rm -fv paymentProvider.js 2>/dev/null || true
rm -fv package.json.bak 2>/dev/null || true
rm -fv tar type 2>/dev/null || true

# PhoneAuth racine uniquement s'il existe déjà ailleurs
if [ -f src/features/auth/PhoneAuth.jsx ] || [ -f src/components/PhoneAuth.jsx ]; then
  rm -fv PhoneAuth.jsx 2>/dev/null || true
else
  echo "→ PhoneAuth.jsx reste (à déplacer manuellement plus tard)"
fi

# Patches et notes → docs/archive
for f in \
  APPLY.md APPLY.txt \
  FEED-VIDEOS-PATCH.md IMPORTS-FIX.md INSTALL.md.txt \
  PATCH-App-jsx-communaute.txt SETTINGS_PATCH.md.txt \
  BAARO-V16-MANIFEST.json
do
  [ -f "$f" ] && mv -v "$f" docs/archive/ || true
done

# Docs versionnées → docs/versions
for f in docs-BAARO-v*.md; do
  [ -f "$f" ] && mv -v "$f" docs/versions/ || true
done

# SQL orphelins → supabase/legacy
for f in \
  delivery_schema.sql \
  supabase-add-debates.sql \
  supabase-add-media.sql \
  supabase-add-messages-security.sql \
  supabase-add-profile-bio.sql \
  supabase-add-social-features.sql \
  supabase-fix-debates-security.sql \
  supabase-schema.sql \
  supabase-security-fix.sql
do
  [ -f "$f" ] && mv -v "$f" supabase/legacy/ || true
done

# ARCHITECTURE.md
if [ -f ARCHITECTURE.md ] && [ -f docs/ARCHITECTURE.md ]; then
  mv -v ARCHITECTURE.md docs/archive/ARCHITECTURE-root.md
elif [ -f ARCHITECTURE.md ]; then
  mv -v ARCHITECTURE.md docs/ARCHITECTURE.md
fi

# README
if [ -f README-GLOBAL.md ]; then
  cp -v README.md docs/archive/README-old-community.md 2>/dev/null || true
  mv -v README-GLOBAL.md README.md
fi

[ -f README-DAILY.md ] && mv -v README-DAILY.md docs/README-DAILY.md || true

echo ""
echo "OK — Phase 1 terminée."
echo "Vérifie avec : git status"
