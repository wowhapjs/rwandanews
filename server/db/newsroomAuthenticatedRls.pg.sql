-- Authenticated newsroom RLS policies for deployments using a publishable Supabase key.
-- Server routes bind the caller JWT and PostgreSQL enforces MEMBER/EDITOR/ADMIN access.

create or replace function public.newsroom_current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.newsroom_profiles
  where user_id = auth.uid()::text
  limit 1
$$;

revoke all on function public.newsroom_current_role() from public;
grant execute on function public.newsroom_current_role() to authenticated;

create or replace function public.newsroom_guard_profile_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text := public.newsroom_current_role();
  active_admins integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if tg_op = 'INSERT' then
    if actor_role = 'ADMIN' then
      return new;
    end if;
    if new.user_id <> auth.uid()::text or new.role <> 'MEMBER' or new.status <> 'ACTIVE' then
      raise exception 'Profile bootstrap is limited to the authenticated MEMBER account';
    end if;
    return new;
  end if;

  if actor_role = 'ADMIN' then
    if old.role = 'ADMIN' and old.status = 'ACTIVE'
       and (new.role <> 'ADMIN' or new.status <> 'ACTIVE') then
      select count(*) into active_admins
      from public.newsroom_profiles
      where role = 'ADMIN' and status = 'ACTIVE';
      if active_admins <= 1 then
        raise exception 'The last active ADMIN cannot be demoted or suspended';
      end if;
    end if;
    return new;
  end if;

  if old.user_id <> auth.uid()::text
     or new.user_id <> old.user_id
     or new.role <> old.role
     or new.status <> old.status
     or new.email is distinct from old.email
     or new.provider is distinct from old.provider then
    raise exception 'Members may only edit their own display profile';
  end if;
  return new;
end
$$;

create or replace function public.newsroom_guard_revision_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text := public.newsroom_current_role();
begin
  if actor_role = 'ADMIN' then
    return new;
  end if;
  if actor_role <> 'EDITOR' or new.author_id <> auth.uid()::text then
    raise exception 'EDITOR permission required';
  end if;
  if new.workflow_state not in ('DRAFT','PENDING_REVIEW') then
    raise exception 'Editors cannot bypass publish approval';
  end if;
  return new;
end
$$;

revoke all on function public.newsroom_guard_profile_write() from public;
revoke all on function public.newsroom_guard_revision_write() from public;

revoke all on public.newsroom_profiles from anon, authenticated;
revoke all on public.newsroom_article_revisions from anon, authenticated;
revoke all on public.newsroom_publish_history from anon, authenticated;
revoke all on public.newsroom_images from anon, authenticated;
revoke all on public.newsroom_audit_events from anon, authenticated;

grant select, insert, update on public.newsroom_profiles to authenticated;
grant select, insert on public.newsroom_article_revisions to authenticated;
grant select, insert on public.newsroom_publish_history to authenticated;
grant select, insert on public.newsroom_images to authenticated;
grant select, insert on public.newsroom_audit_events to authenticated;
grant usage, select on sequence public.newsroom_publish_history_id_seq to authenticated;

drop policy if exists newsroom_profiles_select on public.newsroom_profiles;
create policy newsroom_profiles_select on public.newsroom_profiles
for select to authenticated
using (user_id = auth.uid()::text or public.newsroom_current_role() = 'ADMIN');

drop policy if exists newsroom_profiles_insert on public.newsroom_profiles;
create policy newsroom_profiles_insert on public.newsroom_profiles
for insert to authenticated
with check (
  (user_id = auth.uid()::text and role = 'MEMBER' and status = 'ACTIVE')
  or public.newsroom_current_role() = 'ADMIN'
);

drop policy if exists newsroom_profiles_update on public.newsroom_profiles;
create policy newsroom_profiles_update on public.newsroom_profiles
for update to authenticated
using (user_id = auth.uid()::text or public.newsroom_current_role() = 'ADMIN')
with check (user_id = auth.uid()::text or public.newsroom_current_role() = 'ADMIN');

drop trigger if exists newsroom_profiles_guard_write on public.newsroom_profiles;
create trigger newsroom_profiles_guard_write
before insert or update on public.newsroom_profiles
for each row execute function public.newsroom_guard_profile_write();

drop policy if exists newsroom_revisions_select on public.newsroom_article_revisions;
create policy newsroom_revisions_select on public.newsroom_article_revisions
for select to authenticated
using (author_id = auth.uid()::text or public.newsroom_current_role() = 'ADMIN');

drop policy if exists newsroom_revisions_insert on public.newsroom_article_revisions;
create policy newsroom_revisions_insert on public.newsroom_article_revisions
for insert to authenticated
with check (
  public.newsroom_current_role() = 'ADMIN'
  or (public.newsroom_current_role() = 'EDITOR' and author_id = auth.uid()::text)
);

drop trigger if exists newsroom_revisions_guard_write on public.newsroom_article_revisions;
create trigger newsroom_revisions_guard_write
before insert on public.newsroom_article_revisions
for each row execute function public.newsroom_guard_revision_write();

drop policy if exists newsroom_history_select on public.newsroom_publish_history;
create policy newsroom_history_select on public.newsroom_publish_history
for select to authenticated
using (
  public.newsroom_current_role() = 'ADMIN'
  or actor_user_id = auth.uid()::text
  or exists (
    select 1 from public.newsroom_article_revisions r
    where r.article_id = newsroom_publish_history.article_id
      and r.author_id = auth.uid()::text
  )
);

drop policy if exists newsroom_history_insert on public.newsroom_publish_history;
create policy newsroom_history_insert on public.newsroom_publish_history
for insert to authenticated
with check (
  public.newsroom_current_role() = 'ADMIN'
  or (
    public.newsroom_current_role() = 'EDITOR'
    and actor_user_id = auth.uid()::text
    and action in ('SUBMITTED','RESUBMITTED')
  )
);

drop policy if exists newsroom_images_select on public.newsroom_images;
create policy newsroom_images_select on public.newsroom_images
for select to authenticated
using (uploaded_by = auth.uid()::text or public.newsroom_current_role() = 'ADMIN');

drop policy if exists newsroom_images_insert on public.newsroom_images;
create policy newsroom_images_insert on public.newsroom_images
for insert to authenticated
with check (
  public.newsroom_current_role() = 'ADMIN'
  or (public.newsroom_current_role() = 'EDITOR' and uploaded_by = auth.uid()::text)
);

drop policy if exists newsroom_audit_admin_select on public.newsroom_audit_events;
create policy newsroom_audit_admin_select on public.newsroom_audit_events
for select to authenticated
using (public.newsroom_current_role() = 'ADMIN');

drop policy if exists newsroom_audit_admin_insert on public.newsroom_audit_events;
create policy newsroom_audit_admin_insert on public.newsroom_audit_events
for insert to authenticated
with check (public.newsroom_current_role() = 'ADMIN');

-- Storage uploads are limited to EDITOR/ADMIN and their own editor/<uid>/ path.
drop policy if exists newsroom_images_editor_insert on storage.objects;
create policy newsroom_images_editor_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'newsroom-images'
  and split_part(name,'/',1) = 'editor'
  and split_part(name,'/',2) = auth.uid()::text
  and public.newsroom_current_role() in ('EDITOR','ADMIN')
);
