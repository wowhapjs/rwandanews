-- Cleanup phase: run only after the topic-only application code is deployed.
alter table public.articles drop column if exists portal_category_id;
alter table public.articles drop column if exists source_subcategory;
alter table public.localized_articles drop column if exists category_label;
alter table public.newsroom_article_revisions drop column if exists source_category;
