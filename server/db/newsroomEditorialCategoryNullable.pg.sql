-- Editorial articles begin uncategorized. AI assigns topic/category later.
alter table public.newsroom_article_revisions
  alter column source_category drop not null,
  alter column source_category drop default;
