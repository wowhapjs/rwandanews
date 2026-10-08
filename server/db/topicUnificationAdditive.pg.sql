-- Additive phase: unify classification on topic/topic_sub without dropping legacy columns yet.
alter table public.articles add column if not exists topic_sub text not null default 'General';
alter table public.localized_articles add column if not exists topic_sub text not null default 'General';
update public.articles set topic='General' where processing_status <> 'PROCESSED' or topic is null or btrim(topic)='' or lower(btrim(topic)) in ('undefined','null');
update public.articles set topic_sub='General' where topic_sub is null or btrim(topic_sub)='' or lower(btrim(topic_sub)) in ('undefined','null');
update public.localized_articles l set topic=coalesce(a.topic,'General'), topic_sub='General' from public.articles a where a.article_id=l.article_id;
alter table public.articles alter column topic set default 'General';
alter table public.articles alter column topic set not null;
alter table public.articles alter column topic_sub set default 'General';
alter table public.articles alter column topic_sub set not null;
alter table public.localized_articles alter column topic set default 'General';
alter table public.localized_articles alter column topic set not null;
alter table public.localized_articles alter column topic_sub set default 'General';
alter table public.localized_articles alter column topic_sub set not null;
