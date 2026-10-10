#!/bin/bash
FILE=$(find src -type f -name "*.jsx" | xargs grep -l "export function VideosTab" | head -n1)
echo "→ Fichier trouvé: $FILE"

# 1. Ajoute l'import du logo s'il n'existe pas
if ! grep -q "baaro-logo" "$FILE"; then
  sed -i '1i import baaroLogo from "../../assets/baaro-logo.png";' "$FILE"
  echo "✔ import logo ajouté"
fi

# 2. Fix avatar feed : remplace le bloc flag 🌍 par fallback logo
sed -i 's|{profile.avatar_url ? (|{ (profile.avatar_url || baaroLogo) ? (|g' "$FILE"
sed -i 's|<div className="h-full w-full flex items-center justify-center text-lg">|<img src={baaroLogo} alt="" className="h-full w-full object-cover" data-fallback="true" style={{display:"none"}} \/><div className="h-full w-full flex items-center justify-center text-lg" style={{display:"none"}}>|g' "$FILE"

# 3. Fix simple et sûr : force fallback logo sur les 2 img avatar
# On remplace src={profile.avatar_url} -> src={profile.avatar_url || baaroLogo}
sed -i 's|src={profile.avatar_url}|src={profile.avatar_url || baaroLogo} onError={(e)=>e.target.src=baaroLogo}|g' "$FILE"
sed -i 's|src={comment.profiles?.avatar_url}|src={comment.profiles?.avatar_url || baaroLogo} onError={(e)=>e.target.src=baaroLogo}|g' "$FILE"

# 4. Fix double @@
sed -i 's|@{(profile.handle || "membre")}|@{(profile.handle || "membre").replace(/^@+/, "")}|g' "$FILE"
sed -i 's|@{profile.handle || "membre"}|@{(profile.handle || "membre").replace(/^@+/, "")}|g' "$FILE"

echo "✔ Patch visage vidéo → logo BAARO restauré"
grep -n "baaroLogo" "$FILE"
