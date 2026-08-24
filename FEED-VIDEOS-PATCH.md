# Fil + Vidéos + actions (retour / modifier / supprimer)

## Fichiers à copier

```bash
cp baaro-patches/src/components/FeedStories.jsx src/components/
cp baaro-patches/src/components/FeedTab.jsx src/components/
cp baaro-patches/src/components/VideosTab.jsx src/components/
cp baaro-patches/src/components/BackBar.jsx src/components/
```

`FeedTab.jsx` et `VideosTab.jsx` **remplacent** entièrement les versions actuelles.

## Fil (FeedTab)

- Barre **Statuts** en haut (style WhatsApp) via `FeedStories`
- Menu **⋯** sur **tes** publications :
  - **Modifier** (texte)
  - **Supprimer** (avec confirmation)
- **Partager** (Web Share API ou copie du lien `?post=id`)
- **Supprimer** sur **tes** commentaires

## Vidéos (VideosTab)

- Mode **plein écran** (`fixed inset-0`, `100dvh`, snap vertical)
- Stories retirées de cet onglet (elles sont sur le Fil)
- **Supprimer** ta propre vidéo (icône poubelle dans la colonne d’actions)

## BackBar

Utilisable dans n’importe quelle modale :

```jsx
import { BackBar } from "./BackBar.jsx";

<BackBar title="Réglages" onBack={() => setOpen(false)} />
```

## RLS Supabase (obligatoire pour modifier/supprimer)

Policies typiques :

```sql
-- posts : update/delete par l'auteur
create policy "posts_update_own" on public.posts
  for update using (auth.uid() = author_id);

create policy "posts_delete_own" on public.posts
  for delete using (auth.uid() = author_id);

-- comments
create policy "comments_delete_own" on public.comments
  for delete using (auth.uid() = author_id);

-- videos
create policy "videos_delete_own" on public.videos
  for delete using (auth.uid() = author_id);
```

Sans ces policies, l’UI affiche une erreur au delete/update.

## Test

1. Fil → statuts en haut → publier un statut
2. Publier un post → ⋯ → Modifier / Supprimer
3. Commenter → poubelle sur ton commentaire
4. Vidéos → swipe plein écran → Suppr. sur ta vidéo
