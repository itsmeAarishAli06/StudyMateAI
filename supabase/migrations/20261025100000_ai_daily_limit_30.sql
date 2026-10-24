-- The original quota migration allowed up to 40 requests per day.
-- Clamp any allowance already used today, then set the persistent cap to 30.
update public.ai_daily_usage
set requests_used = 30,
    updated_at = now()
where requests_used > 30;

alter table public.ai_daily_usage
  drop constraint if exists ai_daily_usage_requests_used_check;

alter table public.ai_daily_usage
  add constraint ai_daily_usage_requests_used_check
  check (requests_used between 0 and 30);

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

  select daily.requests_used into v_used
  from public.ai_daily_usage as daily
  where daily.user_id = v_user_id and daily.usage_date = v_today;

  v_used := coalesce(v_used, 0);
  return query select
    v_used,
    greatest(0, 30 - v_used),
    30,
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

  select daily.requests_used into v_used
  from public.ai_daily_usage as daily
  where daily.user_id = v_user_id
  for update;

  if v_used >= 30 then
    return query select false, v_used, 0, 30, ((v_today + 1)::timestamp at time zone 'UTC');
    return;
  end if;

  v_used := v_used + 1;
  update public.ai_daily_usage as daily
  set requests_used = v_used, updated_at = now()
  where daily.user_id = v_user_id;

  return query select true, v_used, 30 - v_used, 30, ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.get_ai_daily_usage() from public, anon;
revoke all on function public.consume_ai_daily_request() from public, anon;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_daily_request() to authenticated;
