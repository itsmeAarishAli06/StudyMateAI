create table if not exists public.study_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('summary', 'quiz')),
  title text not null check (char_length(title) between 1 and 120),
  source_text text,
  content jsonb not null,
  score text,
  created_at timestamptz not null default now(),
  constraint study_items_content_shape check (
    (item_type = 'summary' and source_text is not null and char_length(source_text) between 1 and 12000
      and jsonb_typeof(content) = 'object'
      and jsonb_typeof(content -> 'lead') = 'string'
      and jsonb_typeof(content -> 'points') = 'array'
      and jsonb_typeof(content -> 'takeaway') = 'string'
      and score is null)
    or
    (item_type = 'quiz' and source_text is null
      and case
        when jsonb_typeof(content) = 'object' and jsonb_typeof(content -> 'questions') = 'array'
          then jsonb_array_length(content -> 'questions') between 1 and 10
        else false
      end
      and (score is null or char_length(score) <= 20))
  )
);

create index if not exists study_items_user_created_idx
  on public.study_items (user_id, created_at desc);

alter table public.study_items enable row level security;
revoke all on table public.study_items from public, anon, authenticated;
grant select, insert on table public.study_items to authenticated;

drop policy if exists "Users can read their own study items" on public.study_items;
create policy "Users can read their own study items"
  on public.study_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own study items" on public.study_items;
create policy "Users can create their own study items"
  on public.study_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own study items" on public.study_items;

