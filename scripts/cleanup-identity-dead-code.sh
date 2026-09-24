#!/usr/bin/env bash
# BAARO — nettoyage fichiers morts / dangereux pour l'identité
# Usage:
#   bash scripts/cleanup-identity-dead-code.sh          # dry-run
#   bash scripts/cleanup-identity-dead-code.sh --apply  # applique

set -euo pipefail
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== BAARO cleanup identity dead code ==="
echo "Root: $ROOT"
echo "Mode: $([[ "$APPLY" == true ]] && echo APPLY || echo DRY-RUN)"
echo

remove_file() {
  local f="$1"
  if [[ -f "$f" ]]; then
    if [[ "$APPLY" == true ]]; then
      rm -fv "$f"
    else
      echo "[DRY-RUN] supprimer : $f"
    fi
  else
    echo "[skip] absent : $f"
  fi
}

move_file() {
  local f="$1"
  local dest="$2"
  if [[ -f "$f" ]]; then
    mkdir -p "$(dirname "$dest")"
    if [[ "$APPLY" == true ]]; then
      mv -v "$f" "$dest"
    else
      echo "[DRY-RUN] déplacer : $f → $dest"
    fi
  fi
}

# --- P0 : doubles flux d'auth / helpers morts ---
remove_file "src/features/auth/AuthModal.jsx"
remove_file "src/lib/requireUser.js"

# --- P1 : docs de patch (archive, pas runtime) ---
move_file "docs/IDENTITY_SOCIAL_FIX.md" "docs/archive/IDENTITY_SOCIAL_FIX.md"
move_file "docs/PATCH_AUTH_REGLAGES.md" "docs/archive/PATCH_AUTH_REGLAGES.md"

# --- Vérification références ---
echo
echo "=== Vérification imports restants ==="
if command -v grep >/dev/null 2>&1; then
  if grep -Rn "AuthModal\|lib/requireUser" src/ api/ 2>/dev/null | grep -v "Binary" || true; then
    echo "(ci-dessus = références restantes éventuelles)"
  fi
  echo "OK scan terminé."
fi

echo
echo "=== Rappels (NE PAS supprimer) ==="
echo " - src/features/auth/AuthScreen.jsx  (auth officiel)"
echo " - src/features/auth/PhoneAuth.jsx"
echo " - src/contexts/AppContext.jsx"
echo " - api/_shared.js requireUser (serveur JWT)"
echo " - supabase/migrations/* (ne pas rejouer legacy/)"
echo " - supabase/legacy/* : NE JAMAIS ré-exécuter le SQL"
echo
if [[ "$APPLY" != true ]]; then
  echo "Relancer avec --apply pour appliquer."
fi
