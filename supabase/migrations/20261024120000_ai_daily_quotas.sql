create table if not exists public.ai_daily_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  usage_date date not null,
  requests_used integer not null default 0 check (requests_used between 0 and 40),
  updated_at timestamptz not null default now()
);

alter table public.ai_daily_usage enable row level security;
revoke all on table public.ai_daily_usage from public, anon, authenticated;
grant select on table public.ai_daily_usage to authenticated;

drop policy if exists "Users can read their own AI daily usage" on public.ai_daily_usage;
create policy "Users can read their own AI daily usage"
  on public.ai_daily_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_ai_daily_usage()
returns table (
  used integer,
  remaining integer,
  daily_limit integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_used integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select usage.requests_used into v_used
  from public.ai_daily_usage as usage
  where usage.user_id = v_user_id and usage.usage_date = v_today;

  return query select
    coalesce(v_used, 0),
    40 - coalesce(v_used, 0),
    40,
    ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

create or replace function public.consume_ai_daily_request()
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  daily_limit integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_used integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, requests_used)
  values (v_user_id, v_today, 0)
  on conflict (user_id) do update
    set usage_date = excluded.usage_date,
        requests_used = 0,
        updated_at = now()
    where public.ai_daily_usage.usage_date <> excluded.usage_date;

  select usage.requests_used into v_used
  from public.ai_daily_usage as usage
  where usage.user_id = v_user_id
  for update;

  if v_used >= 40 then
    return query select false, v_used, 0, 40, ((v_today + 1)::timestamp at time zone 'UTC');
    return;
  end if;

  v_used := v_used + 1;
  update public.ai_daily_usage as usage
  set requests_used = v_used, updated_at = now()
  where usage.user_id = v_user_id;

  return query select true, v_used, 40 - v_used, 40, ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.get_ai_daily_usage() from public, anon;
revoke all on function public.consume_ai_daily_request() from public, anon;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_daily_request() to authenticated;
