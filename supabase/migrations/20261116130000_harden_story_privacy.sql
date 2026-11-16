-- Stories: visibilité, réactions, réponses et lecture des vues.
-- Migration additive: ne modifie pas les données existantes.

create or replace function public.can_view_story(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stories s
    where s.id = p_story_id
      and s.deleted_at is null
      and (
        s.author_id = auth.uid()
        or (
          s.publish_at <= now()
          and s.expires_at > now()
          and (
            s.visibility = 'public'
            or (
              s.visibility = 'followers'
              and exists (
                select 1 from public.follows f
                where f.follower_id = auth.uid()
                  and f.followed_id = s.author_id
                  and f.status = 'accepted'
              )
            )
            or (
              s.visibility = 'close_friends'
              and exists (
                select 1 from public.story_close_friends cf
                where cf.owner_id = s.author_id
                  and cf.member_id = auth.uid()
              )
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_view_story(uuid) from public;
grant execute on function public.can_view_story(uuid) to anon, authenticated;

-- La policy précédente stories_read USING (true) exposait aussi les stories
-- followers/close_friends et les stories expirées aux autres utilisateurs.
drop policy if exists stories_owner on public.stories;
drop policy if exists stories_read on public.stories;
create policy stories_owner on public.stories
  for all to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
create policy stories_read on public.stories
  for select to anon, authenticated
  using (public.can_view_story(id));

-- Les réactions ne doivent être lisibles que par leur auteur ou le propriétaire
-- de la story. Les écritures restent limitées à l'utilisateur authentifié.
drop policy if exists story_reactions_owner on public.story_reactions;
drop policy if exists story_reactions_read on public.story_reactions;
create policy story_reactions_owner on public.story_reactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.can_view_story(story_id)
    and reaction in ('❤️', '🔥', '😂', '😮')
  );
create policy story_reactions_read on public.story_reactions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

-- Réponses: envoi uniquement sur une story effectivement visible; lecture
-- limitée à l'expéditeur et au propriétaire.
drop policy if exists story_replies_ins on public.story_replies;
drop policy if exists story_replies_sel on public.story_replies;
create policy story_replies_ins on public.story_replies
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_view_story(story_id));
create policy story_replies_sel on public.story_replies
  for select to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

-- Les réponses de stickers suivent les mêmes règles que les réponses libres.
drop policy if exists sticker_resp_insert on public.story_sticker_responses;
drop policy if exists sticker_resp_select on public.story_sticker_responses;
create policy sticker_resp_insert on public.story_sticker_responses
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_story(story_id));
create policy sticker_resp_select on public.story_sticker_responses
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

comment on function public.can_view_story(uuid) is
  'Autorise la lecture d une story selon owner/public/followers/close_friends et la fenetre 24h.';
