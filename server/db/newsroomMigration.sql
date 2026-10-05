-- Newsroom v2 additive SQLite schema. No DROP/DELETE operations.
-- Supabase deployments should apply an equivalent PostgreSQL migration separately.
create table if not exists newsroom_profiles (
  user_id text primary key,
  display_name text,
  role text not null default 'READER' check (role in ('READER','REPORTER','ADMIN')),
  can_publish_directly integer not null default 0,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists newsroom_article_revisions (
  revision_id text primary key,
  article_id text not null,
  author_id text not null,
  title text not null,
  subtitle text,
  body_markdown text not null,
  workflow_state text not null check (workflow_state in ('DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED')),
  created_at text not null default (datetime('now'))
);
create index if not exists idx_newsroom_revisions_article on newsroom_article_revisions(article_id, created_at desc);

create table if not exists newsroom_images (
  image_id text primary key,
  article_id text,
  uploaded_by text not null,
  storage_url text not null,
  alt text,
  caption text,
  credit text,
  created_at text not null default (datetime('now'))
);

create table if not exists newsroom_audit_events (
  event_id text primary key,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_json text,
  after_json text,
  created_at text not null default (datetime('now'))
);
create index if not exists idx_newsroom_audit_target on newsroom_audit_events(target_type, target_id, created_at desc);

create table if not exists story_agent_batches (
  batch_id text primary key,
  status text not null default 'PENDING' check (status in ('PENDING','VALIDATED','APPLIED','REVERTED')),
  article_ids_json text not null,
  proposed_json text,
  created_by text not null,
  created_at text not null default (datetime('now')),
  applied_at text
);

create table if not exists story_cluster_recovery_snapshots (
  snapshot_id text primary key,
  created_by text not null,
  associations_json text not null,
  created_at text not null default (datetime('now')),
  restored_at text
);
