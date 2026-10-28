create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  exam_date date not null,
  topics text[] not null check (cardinality(topics) between 1 and 20),
  format text not null default 'mcq' check (format = 'mcq'),
  question_count integer not null check (question_count in (5, 10, 15, 20, 25)),
  duration_minutes integer not null check (duration_minutes between 10 and 180),
  questions jsonb not null check (
    case when jsonb_typeof(questions) = 'array'
      then jsonb_array_length(questions) = question_count
      else false
    end
  ),
  answers jsonb check (answers is null or jsonb_typeof(answers) = 'array'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_attempts_completion_shape check (
    (status = 'in_progress' and submitted_at is null and answers is null and result is null)
    or (status = 'submitted' and submitted_at is not null and answers is not null and result is not null)
  ),
  constraint exam_attempts_time_order check (expires_at > started_at)
);

create index if not exists exam_attempts_user_created_idx
  on public.exam_attempts (user_id, created_at desc);

create or replace function public.touch_exam_attempt_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exam_attempts_touch_updated_at on public.exam_attempts;
create trigger exam_attempts_touch_updated_at
  before update on public.exam_attempts
  for each row execute function public.touch_exam_attempt_updated_at();

alter table public.exam_attempts enable row level security;
revoke all on table public.exam_attempts from public, anon, authenticated;
grant select, insert, update on table public.exam_attempts to authenticated;

drop policy if exists "Users can read their own exam attempts" on public.exam_attempts;
create policy "Users can read their own exam attempts"
  on public.exam_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own exam attempts" on public.exam_attempts;
create policy "Users can create their own exam attempts"
  on public.exam_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own exam attempts" on public.exam_attempts;
create policy "Users can update their own exam attempts"
  on public.exam_attempts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
