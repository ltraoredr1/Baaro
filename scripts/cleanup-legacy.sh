#!/usr/bin/env bash
# BAARO — Phase 1 : nettoyage legacy / doublons
# Mode sûr par défaut : aperçu uniquement.
# Exécution réelle : bash scripts/cleanup-legacy-phase1.sh --apply

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APPLY=false

if [ "${1:-}" = "--apply" ]; then
  APPLY=true
fi

echo "== BAARO cleanup Phase 1 =="

if [ "$APPLY" = false ]; then
  echo "MODE APERÇU — aucun fichier ne sera supprimé ou déplacé."
  echo "Pour appliquer : bash scripts/cleanup-legacy-phase1.sh --apply"
  echo ""
fi

mkdir -p docs/archive docs/versions supabase/legacy

remove_file() {
  local file="$1"

  if [ -f "$file" ]; then
    if [ "$APPLY" = true ]; then
      rm -fv "$file"
    else
      echo "[DRY-RUN] supprimer : $file"
    fi
  fi
}

move_file() {
  local file="$1"
  local destination="$2"

  if [ -f "$file" ]; then
    if [ "$APPLY" = true ]; then
      mv -v "$file" "$destination"
    else
      echo "[DRY-RUN] déplacer : $file → $destination"
    fi
  fi
}

# Doublons / fichiers morts
remove_file "src/components/ShopFeature.jsx"
remove_file "src/components/ShopRegistrationForm.jsx"
remove_file "paymentProvider.js"
remove_file "package.json.bak"
remove_file "tar type"

# PhoneAuth racine uniquement s'il existe déjà ailleurs
if [ -f "PhoneAuth.jsx" ]; then
  if [ -f "src/features/auth/PhoneAuth.jsx" ] ||
     [ -f "src/components/PhoneAuth.jsx" ]; then
    remove_file "PhoneAuth.jsx"
  else
    echo "→ PhoneAuth.jsx reste (à déplacer manuellement plus tard)"
  fi
fi

# Patches et notes → docs/archive
for f in \
  APPLY.md \
  APPLY.txt \
  FEED-VIDEOS-PATCH.md \
  IMPORTS-FIX.md \
  INSTALL.md.txt \
  PATCH-App-jsx-communaute.txt \
  SETTINGS_PATCH.md.txt \
  BAARO-V16-MANIFEST.json
do
  move_file "$f" "docs/archive/"
done

# Docs versionnées → docs/versions
for f in docs-BAARO-v*.md; do
  [ -f "$f" ] && move_file "$f" "docs/versions/"
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
  move_file "$f" "supabase/legacy/"
done

# ARCHITECTURE.md
if [ -f "ARCHITECTURE.md" ] && [ -f "docs/ARCHITECTURE.md" ]; then
  move_file "ARCHITECTURE.md" "docs/archive/ARCHITECTURE-root.md"
elif [ -f "ARCHITECTURE.md" ]; then
  move_file "ARCHITECTURE.md" "docs/ARCHITECTURE.md"
fi

# README
if [ -f "README-GLOBAL.md" ]; then
  if [ "$APPLY" = true ]; then
    if [ -f "README.md" ]; then
      cp -v "README.md" "docs/archive/README-old-community.md"
    fi
    mv -v "README-GLOBAL.md" "README.md"
  else
    echo "[DRY-RUN] remplacer : README.md ← README-GLOBAL.md"
    [ -f "README.md" ] &&
      echo "[DRY-RUN] sauvegarder : README.md → docs/archive/README-old-community.md"
  fi
fi

move_file "README-DAILY.md" "docs/README-DAILY.md"

echo ""

if [ "$APPLY" = true ]; then
  echo "OK — Phase 1 appliquée."
  echo "Vérifie maintenant avec :"
  echo "  git status"
  echo "  git diff --stat"
else
  echo "APERÇU terminé — aucune modification effectuée."
  echo "Si la liste est correcte, applique avec :"
  echo "  bash scripts/cleanup-legacy-phase1.sh --apply"
fi
