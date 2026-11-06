-- Manual StudyMate Premium access, WhatsApp payment requests, and plan based AI quotas.
-- Additive migration: existing history and quota rows remain intact.

create table if not exists public.studymate_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.studymate_admins (user_id)
select id from auth.users where lower(email) = lower('itsmeaarish06@gmail.com')
on conflict (user_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.studymate_admins as admins
    join auth.users as users on users.id = admins.user_id
    where lower(users.email) = lower('itsmeaarish06@gmail.com')
  ) then
    raise exception 'Admin account itsmeaarish06@gmail.com was not found in Supabase Auth. Create/confirm that account, then run this migration again.';
  end if;
end;
$$;

create table if not exists public.study_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null check (plan_key in ('weekly', 'monthly')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  check (expires_at > started_at)
);

create index if not exists study_entitlements_expiry_idx
  on public.study_entitlements (expires_at);

create table if not exists public.study_payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique default ('SM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_key text not null check (plan_key in ('weekly', 'monthly')),
  amount_pkr integer not null check (amount_pkr in (200, 550)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  transaction_reference text check (transaction_reference is null or char_length(transaction_reference) <= 120),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  review_note text check (review_note is null or char_length(review_note) <= 300),
  check ((plan_key = 'weekly' and amount_pkr = 200) or (plan_key = 'monthly' and amount_pkr = 550))
);

create index if not exists study_payment_requests_user_created_idx
  on public.study_payment_requests (user_id, created_at desc);
create index if not exists study_payment_requests_status_created_idx
  on public.study_payment_requests (status, created_at desc);
create unique index if not exists study_payment_requests_one_pending_per_user_idx
  on public.study_payment_requests (user_id) where status = 'pending';

create table if not exists public.study_entitlement_events (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users (id),
  target_user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid references public.study_payment_requests (id) on delete set null,
  action text not null check (action in ('grant', 'extend', 'revoke', 'reject')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists study_entitlement_events_target_created_idx
  on public.study_entitlement_events (target_user_id, created_at desc);

alter table public.studymate_admins enable row level security;
alter table public.study_entitlements enable row level security;
alter table public.study_payment_requests enable row level security;
alter table public.study_entitlement_events enable row level security;
revoke all on public.studymate_admins, public.study_entitlements,
  public.study_payment_requests, public.study_entitlement_events from public, anon, authenticated;
grant select on public.study_entitlements, public.study_payment_requests to authenticated;

drop policy if exists "Users can read own study entitlement" on public.study_entitlements;
create policy "Users can read own study entitlement" on public.study_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can read own payment requests" on public.study_payment_requests;
create policy "Users can read own payment requests" on public.study_payment_requests
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_studymate_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.studymate_admins where user_id = auth.uid());
$$;

create or replace function public.get_studymate_access()
returns table (
  is_admin boolean,
  plan_key text,
  premium_active boolean,
  started_at timestamptz,
  expires_at timestamptz,
  daily_limit integer,
  pending_request jsonb,
  latest_request jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entitlement public.study_entitlements%rowtype;
  v_request jsonb;
  v_latest_request jsonb;
  v_premium boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select * into v_entitlement from public.study_entitlements where user_id = v_user_id;
  v_premium := found and v_entitlement.expires_at > now();
  select jsonb_build_object('id', id, 'requestCode', request_code, 'planKey', plan_key,
      'amountPkr', amount_pkr, 'status', status, 'createdAt', created_at)
    into v_request
    from public.study_payment_requests
    where user_id = v_user_id and status = 'pending'
    order by created_at desc limit 1;
  select jsonb_build_object('id', id, 'requestCode', request_code, 'planKey', plan_key,
      'amountPkr', amount_pkr, 'status', status, 'createdAt', created_at,
      'reviewedAt', reviewed_at, 'reviewNote', review_note)
    into v_latest_request
    from public.study_payment_requests
    where user_id = v_user_id
    order by created_at desc limit 1;

  return query select
    public.is_studymate_admin(),
    case when v_premium then v_entitlement.plan_key when public.is_studymate_admin() then 'admin' else 'free' end,
    v_premium,
    case when v_premium then v_entitlement.started_at else null end,
    case when v_premium then v_entitlement.expires_at else v_entitlement.expires_at end,
    case when v_premium or public.is_studymate_admin() then 30 else 10 end,
    v_request,
    v_latest_request;
end;
$$;

create or replace function public.create_study_payment_request(p_plan_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_payment_requests%rowtype;
  v_amount integer;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_plan_key is null or p_plan_key not in ('weekly', 'monthly') then raise exception using errcode = '22023', message = 'Choose a valid plan'; end if;
  v_amount := case when p_plan_key = 'weekly' then 200 else 550 end;
  insert into public.study_payment_requests (user_id, plan_key, amount_pkr)
    values (v_user_id, p_plan_key, v_amount) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'requestCode', v_row.request_code,
    'planKey', v_row.plan_key, 'amountPkr', v_row.amount_pkr,
    'status', v_row.status, 'createdAt', v_row.created_at);
end;
$$;

create or replace function public.cancel_study_payment_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  update public.study_payment_requests set status = 'cancelled'
    where id = p_request_id and user_id = auth.uid() and status = 'pending';
  return found;
end;
$$;

create or replace function public.admin_list_study_payment_requests()
returns table (
  id uuid, request_code text, user_id uuid, user_email text, plan_key text,
  amount_pkr integer, status text, transaction_reference text, created_at timestamptz,
  current_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_studymate_admin() then raise exception using errcode = '42501', message = 'Admin access required'; end if;
  return query
    select r.id, r.request_code, r.user_id, u.email::text, r.plan_key,
      r.amount_pkr, r.status, r.transaction_reference, r.created_at, e.expires_at
    from public.study_payment_requests r
    join auth.users u on u.id = r.user_id
    left join public.study_entitlements e on e.user_id = r.user_id
    order by case r.status when 'pending' then 0 else 1 end, r.created_at desc
    limit 200;
end;
$$;

create or replace function public.admin_review_study_payment_request(
  p_request_id uuid, p_decision text, p_transaction_reference text default null, p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.study_payment_requests%rowtype;
  v_previous public.study_entitlements%rowtype;
  v_start timestamptz;
  v_entitlement_start timestamptz;
  v_expiry timestamptz;
  v_days integer;
  v_action text;
begin
  if v_admin is null or not public.is_studymate_admin() then raise exception using errcode = '42501', message = 'Admin access required'; end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then raise exception using errcode = '22023', message = 'Invalid decision'; end if;
  if p_transaction_reference is not null and char_length(p_transaction_reference) > 120 then raise exception using errcode = '22023', message = 'Transaction reference is too long'; end if;
  if p_review_note is not null and char_length(p_review_note) > 300 then raise exception using errcode = '22023', message = 'Review note is too long'; end if;
  if p_decision = 'approve' and nullif(btrim(p_transaction_reference), '') is null then
    raise exception using errcode = '22023', message = 'Enter the verified transaction reference before approving';
  end if;

  select * into v_request from public.study_payment_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception using errcode = 'P0002', message = 'Pending payment request not found'; end if;

  if p_decision = 'reject' then
    update public.study_payment_requests set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin,
      transaction_reference = null, review_note = nullif(btrim(p_review_note), '')
      where id = v_request.id;
    insert into public.study_entitlement_events (admin_user_id, target_user_id, request_id, action, details)
      values (v_admin, v_request.user_id, v_request.id, 'reject', jsonb_build_object('planKey', v_request.plan_key));
    return jsonb_build_object('status', 'rejected');
  end if;

  v_days := case when v_request.plan_key = 'weekly' then 7 else 30 end;
  select * into v_previous from public.study_entitlements where user_id = v_request.user_id for update;
  v_start := case when found and v_previous.expires_at > now() then v_previous.expires_at else now() end;
  v_entitlement_start := case when found and v_previous.expires_at > now() then v_previous.started_at else now() end;
  v_expiry := v_start + make_interval(days => v_days);
  insert into public.study_entitlements (user_id, plan_key, started_at, expires_at, granted_by, updated_at)
    values (v_request.user_id, v_request.plan_key, v_entitlement_start, v_expiry, v_admin, now())
    on conflict (user_id) do update set plan_key = excluded.plan_key, started_at = excluded.started_at,
      expires_at = excluded.expires_at, granted_by = excluded.granted_by, updated_at = now();
  update public.study_payment_requests set status = 'approved', reviewed_at = now(), reviewed_by = v_admin,
    transaction_reference = nullif(btrim(p_transaction_reference), ''), review_note = nullif(btrim(p_review_note), '')
    where id = v_request.id;
  v_action := case when v_previous.user_id is not null and v_previous.expires_at > now() then 'extend' else 'grant' end;
  insert into public.study_entitlement_events (admin_user_id, target_user_id, request_id, action, details)
    values (v_admin, v_request.user_id, v_request.id, v_action,
      jsonb_build_object('planKey', v_request.plan_key, 'days', v_days, 'expiresAt', v_expiry));
  return jsonb_build_object('status', 'approved', 'planKey', v_request.plan_key,
    'startedAt', v_start, 'expiresAt', v_expiry);
end;
$$;

create or replace function public.admin_revoke_study_access(p_user_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_studymate_admin() then raise exception using errcode = '42501', message = 'Admin access required'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception using errcode = '22023', message = 'Note is too long'; end if;
  update public.study_entitlements set expires_at = now(), updated_at = now(), granted_by = auth.uid()
    where user_id = p_user_id and expires_at > now();
  if found then
    insert into public.study_entitlement_events (admin_user_id, target_user_id, action, details)
      values (auth.uid(), p_user_id, 'revoke', jsonb_build_object('note', nullif(btrim(p_note), '')));
  end if;
  return found;
end;
$$;

create or replace function public.get_ai_daily_usage()
returns table (used integer, remaining integer, daily_limit integer, resets_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_used integer := 0;
  v_limit integer := 10;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if public.is_studymate_admin() or exists (select 1 from public.study_entitlements where user_id = v_user_id and expires_at > now()) then v_limit := 30; end if;
  select usage.requests_used into v_used from public.ai_daily_usage usage
    where usage.user_id = v_user_id and usage.usage_date = v_today;
  v_used := coalesce(v_used, 0);
  return query select v_used, greatest(0, v_limit - v_used), v_limit, ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

create or replace function public.consume_ai_daily_request()
returns table (allowed boolean, used integer, remaining integer, daily_limit integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_used integer := 0;
  v_limit integer := 10;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if public.is_studymate_admin() or exists (select 1 from public.study_entitlements where user_id = v_user_id and expires_at > now()) then v_limit := 30; end if;
  insert into public.ai_daily_usage (user_id, usage_date, requests_used) values (v_user_id, v_today, 0)
    on conflict (user_id) do update set usage_date = excluded.usage_date, requests_used = 0, updated_at = now()
    where public.ai_daily_usage.usage_date <> excluded.usage_date;
  select usage.requests_used into v_used from public.ai_daily_usage usage where usage.user_id = v_user_id for update;
  if v_used >= v_limit then
    return query select false, v_used, 0, v_limit, ((v_today + 1)::timestamp at time zone 'UTC');
    return;
  end if;
  v_used := v_used + 1;
  update public.ai_daily_usage usage set requests_used = v_used, updated_at = now() where usage.user_id = v_user_id;
  return query select true, v_used, v_limit - v_used, v_limit, ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.is_studymate_admin() from public, anon;
revoke all on function public.get_studymate_access() from public, anon;
revoke all on function public.create_study_payment_request(text) from public, anon;
revoke all on function public.cancel_study_payment_request(uuid) from public, anon;
revoke all on function public.admin_list_study_payment_requests() from public, anon;
revoke all on function public.admin_review_study_payment_request(uuid, text, text, text) from public, anon;
revoke all on function public.admin_revoke_study_access(uuid, text) from public, anon;
revoke all on function public.get_ai_daily_usage() from public, anon;
revoke all on function public.consume_ai_daily_request() from public, anon;
grant execute on function public.is_studymate_admin() to authenticated;
grant execute on function public.get_studymate_access() to authenticated;
grant execute on function public.create_study_payment_request(text) to authenticated;
grant execute on function public.cancel_study_payment_request(uuid) to authenticated;
grant execute on function public.admin_list_study_payment_requests() to authenticated;
grant execute on function public.admin_review_study_payment_request(uuid, text, text, text) to authenticated;
grant execute on function public.admin_revoke_study_access(uuid, text) to authenticated;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_daily_request() to authenticated;
