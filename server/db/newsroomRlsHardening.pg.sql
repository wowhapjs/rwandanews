-- Server-only newsroom data access hardening.
-- The application authenticates through server routes using the service role;
-- browser roles must not access newsroom control tables directly.

alter table if exists public.newsroom_profiles enable row level security;
alter table if exists public.newsroom_article_revisions enable row level security;
alter table if exists public.newsroom_publish_history enable row level security;
alter table if exists public.newsroom_images enable row level security;
alter table if exists public.newsroom_audit_events enable row level security;

revoke all privileges on table public.newsroom_profiles from anon, authenticated;
revoke all privileges on table public.newsroom_article_revisions from anon, authenticated;
revoke all privileges on table public.newsroom_publish_history from anon, authenticated;
revoke all privileges on table public.newsroom_images from anon, authenticated;
revoke all privileges on table public.newsroom_audit_events from anon, authenticated;
