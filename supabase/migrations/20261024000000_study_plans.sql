create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  exam_date date not null,
  daily_minutes integer not null check (daily_minutes between 15 and 240),
  topics text[] not null check (cardinality(topics) between 1 and 30),
  schedule jsonb not null check (
    case when jsonb_typeof(schedule) = 'array'
      then jsonb_array_length(schedule) between 1 and 120
      else false
    end
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_plans_user_updated_idx
  on public.study_plans (user_id, updated_at desc);

create or replace function public.touch_study_plan_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_plans_touch_updated_at on public.study_plans;
create trigger study_plans_touch_updated_at
  before update on public.study_plans
  for each row execute function public.touch_study_plan_updated_at();

alter table public.study_plans enable row level security;
revoke all on table public.study_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.study_plans to authenticated;

drop policy if exists "Users can read their own study plans" on public.study_plans;
create policy "Users can read their own study plans"
  on public.study_plans for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own study plans" on public.study_plans;
create policy "Users can create their own study plans"
  on public.study_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own study plans" on public.study_plans;
create policy "Users can update their own study plans"
  on public.study_plans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own study plans" on public.study_plans;
create policy "Users can delete their own study plans"
  on public.study_plans for delete to authenticated
  using ((select auth.uid()) = user_id);
