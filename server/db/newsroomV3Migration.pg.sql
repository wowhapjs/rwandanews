-- Newsroom v3 additive migration: article views + safe author unpublish support.
alter table public.articles add column if not exists view_count bigint not null default 0;

create or replace function public.increment_article_view(target_article_id text)
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare next_count bigint;
begin
  update public.articles set view_count=coalesce(view_count,0)+1 where article_id=target_article_id returning view_count into next_count;
  return coalesce(next_count,0);
end $$;
grant execute on function public.increment_article_view(text) to anon, authenticated;

create or replace function public.newsroom_guard_revision_write()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor_role text := public.newsroom_current_role();
begin
  if actor_role='ADMIN' then return new; end if;
  if actor_role<>'EDITOR' or new.author_id<>auth.uid()::text then raise exception 'EDITOR permission required'; end if;
  if new.workflow_state not in ('DRAFT','PENDING_REVIEW','ARCHIVED') then raise exception 'Editors cannot bypass publish approval'; end if;
  return new;
end $$;

create or replace function public.newsroom_unpublish_owned_article(target_article_id text)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor text:=auth.uid()::text; actor_role text:=public.newsroom_current_role();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if actor_role<>'ADMIN' and not exists(select 1 from public.newsroom_article_revisions where article_id=target_article_id and author_id=actor) then raise exception 'Forbidden'; end if;
  delete from public.articles where article_id=target_article_id;
  return true;
end $$;
grant execute on function public.newsroom_unpublish_owned_article(text) to authenticated;

-- Any authenticated member may upload only their own cropped avatar under avatar/<uid>/...
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='newsroom_avatar_insert') then
    create policy newsroom_avatar_insert on storage.objects for insert to authenticated
      with check (bucket_id='newsroom-images' and split_part(name,'/',1)='avatar' and split_part(name,'/',2)=auth.uid()::text);
  end if;
end $$;

-- Normalize existing editorial publications/drafts to the standard initial category.
update public.articles
set topic=coalesce(nullif(topic,''),'General')
where source_id='editorial';
