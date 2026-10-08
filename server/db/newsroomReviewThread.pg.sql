-- Allow editors to append bounded workflow/comment events for their own articles.
drop policy if exists newsroom_history_insert on public.newsroom_publish_history;
create policy newsroom_history_insert on public.newsroom_publish_history
for insert to authenticated
with check (
  public.newsroom_current_role() = 'ADMIN'
  or (
    public.newsroom_current_role() = 'EDITOR'
    and actor_user_id = auth.uid()::text
    and action in ('SUBMITTED','RESUBMITTED','REVISION_SUBMITTED','COMMENT','ARCHIVED_BY_AUTHOR')
    and exists (
      select 1
      from public.newsroom_article_revisions r
      where r.article_id = newsroom_publish_history.article_id
        and r.author_id = auth.uid()::text
    )
  )
);
