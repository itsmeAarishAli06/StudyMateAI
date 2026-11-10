-- One-time three-day trial for confirmed accounts created after this migration.
-- Existing accounts and existing paid/admin accounts are not eligible.

create table if not exists public.study_trial_config (
  id boolean primary key default true check (id),
  enabled_from timestamptz not null
);

insert into public.study_trial_config (id, enabled_from)
values (true, now())
on conflict (id) do nothing;

create table if not exists public.study_free_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at = started_at + interval '72 hours')
);

create index if not exists study_free_trials_expiry_idx
  on public.study_free_trials (expires_at);

alter table public.study_trial_config enable row level security;
alter table public.study_free_trials enable row level security;
revoke all on public.study_trial_config, public.study_free_trials from public, anon, authenticated;

create or replace function public.get_study_trial_status()
returns table (
  eligible boolean,
  claimed boolean,
  active boolean,
  started_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_enabled_from timestamptz;
  v_trial public.study_free_trials%rowtype;
  v_claimed boolean := false;
  v_active boolean := false;
  v_eligible boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select users.created_at, users.email_confirmed_at
    into v_created_at, v_email_confirmed_at
    from auth.users as users
    where users.id = v_user_id;
  select config.enabled_from into v_enabled_from
    from public.study_trial_config as config where config.id = true;
  select trial.* into v_trial
    from public.study_free_trials as trial where trial.user_id = v_user_id;
  v_claimed := found;
  v_active := v_claimed and v_trial.expires_at > now();
  v_eligible := not v_claimed
    and v_created_at is not null
    and v_created_at >= v_enabled_from
    and v_email_confirmed_at is not null
    and not public.is_studymate_admin()
    and not exists (
      select 1 from public.study_entitlements as entitlement
      where entitlement.user_id = v_user_id
    );

  return query select v_eligible, v_claimed, v_active,
    case when v_claimed then v_trial.started_at else null end,
    case when v_claimed then v_trial.expires_at else null end;
end;
$$;

create or replace function public.claim_study_free_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_enabled_from timestamptz;
  v_now timestamptz := now();
  v_trial public.study_free_trials%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select users.created_at, users.email_confirmed_at
    into v_created_at, v_email_confirmed_at
    from auth.users as users where users.id = v_user_id;
  select config.enabled_from into v_enabled_from
    from public.study_trial_config as config where config.id = true;

  if v_created_at is null or v_created_at < v_enabled_from
    or v_email_confirmed_at is null
    or public.is_studymate_admin()
    or exists (select 1 from public.study_entitlements as entitlement where entitlement.user_id = v_user_id)
  then
    raise exception using errcode = 'P0002', message = 'Account is not eligible for the new-student trial';
  end if;

  begin
    insert into public.study_free_trials (user_id, started_at, expires_at)
      values (v_user_id, v_now, v_now + interval '72 hours')
      returning * into v_trial;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'This account has already claimed its free trial';
  end;

  return jsonb_build_object('startedAt', v_trial.started_at, 'expiresAt', v_trial.expires_at);
end;
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
  v_trial public.study_free_trials%rowtype;
  v_request jsonb;
  v_latest_request jsonb;
  v_paid boolean := false;
  v_trial_active boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select entitlement.* into v_entitlement
    from public.study_entitlements as entitlement where entitlement.user_id = v_user_id;
  v_paid := found and v_entitlement.expires_at > now();
  select trial.* into v_trial
    from public.study_free_trials as trial where trial.user_id = v_user_id;
  v_trial_active := found and v_trial.expires_at > now();

  select jsonb_build_object(
      'id', payment_request.id, 'requestCode', payment_request.request_code,
      'planKey', payment_request.plan_key, 'offerType', payment_request.offer_type,
      'recipientEmails', case when payment_request.offer_type = 'friends' then (
        select coalesce(jsonb_agg(user_record.email::text order by user_record.email), '[]'::jsonb)
        from unnest(payment_request.recipient_user_ids) as recipient(user_id)
        join auth.users as user_record on user_record.id = recipient.user_id
      ) else '[]'::jsonb end,
      'amountPkr', payment_request.amount_pkr, 'status', payment_request.status,
      'createdAt', payment_request.created_at
    ) into v_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id and payment_request.status = 'pending'
    order by payment_request.created_at desc limit 1;

  select jsonb_build_object(
      'id', payment_request.id, 'requestCode', payment_request.request_code,
      'planKey', payment_request.plan_key, 'offerType', payment_request.offer_type,
      'recipientEmails', case when payment_request.offer_type = 'friends' then (
        select coalesce(jsonb_agg(user_record.email::text order by user_record.email), '[]'::jsonb)
        from unnest(payment_request.recipient_user_ids) as recipient(user_id)
        join auth.users as user_record on user_record.id = recipient.user_id
      ) else '[]'::jsonb end,
      'amountPkr', payment_request.amount_pkr, 'status', payment_request.status,
      'createdAt', payment_request.created_at, 'reviewedAt', payment_request.reviewed_at,
      'reviewNote', payment_request.review_note
    ) into v_latest_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id
    order by payment_request.created_at desc limit 1;

  return query select
    public.is_studymate_admin(),
    case when v_paid then v_entitlement.plan_key
      when v_trial_active then 'trial'
      when public.is_studymate_admin() then 'admin' else 'free' end,
    v_paid or v_trial_active,
    case when v_paid then v_entitlement.started_at when v_trial_active then v_trial.started_at else null end,
    case when v_paid then v_entitlement.expires_at when v_trial_active then v_trial.expires_at else v_entitlement.expires_at end,
    case when v_paid or v_trial_active or public.is_studymate_admin() then 30 else 10 end,
    v_request,
    v_latest_request;
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
  if public.is_studymate_admin()
    or exists (select 1 from public.study_entitlements as entitlement where entitlement.user_id = v_user_id and entitlement.expires_at > now())
    or exists (select 1 from public.study_free_trials as trial where trial.user_id = v_user_id and trial.expires_at > now())
  then v_limit := 30; end if;
  select usage.requests_used into v_used
    from public.ai_daily_usage as usage where usage.user_id = v_user_id and usage.usage_date = v_today;
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
  if public.is_studymate_admin()
    or exists (select 1 from public.study_entitlements as entitlement where entitlement.user_id = v_user_id and entitlement.expires_at > now())
    or exists (select 1 from public.study_free_trials as trial where trial.user_id = v_user_id and trial.expires_at > now())
  then v_limit := 30; end if;
  insert into public.ai_daily_usage (user_id, usage_date, requests_used)
    values (v_user_id, v_today, 0)
    on conflict (user_id) do update
      set usage_date = excluded.usage_date, requests_used = 0, updated_at = now()
      where public.ai_daily_usage.usage_date <> excluded.usage_date;
  select usage.requests_used into v_used
    from public.ai_daily_usage as usage where usage.user_id = v_user_id for update;
  if v_used >= v_limit then
    return query select false, v_used, 0, v_limit, ((v_today + 1)::timestamp at time zone 'UTC');
    return;
  end if;
  v_used := v_used + 1;
  update public.ai_daily_usage as usage
    set requests_used = v_used, updated_at = now() where usage.user_id = v_user_id;
  return query select true, v_used, v_limit - v_used, v_limit, ((v_today + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.get_study_trial_status() from public, anon;
revoke all on function public.claim_study_free_trial() from public, anon;
revoke all on function public.get_studymate_access() from public, anon;
revoke all on function public.get_ai_daily_usage() from public, anon;
revoke all on function public.consume_ai_daily_request() from public, anon;
grant execute on function public.get_study_trial_status() to authenticated;
grant execute on function public.claim_study_free_trial() to authenticated;
grant execute on function public.get_studymate_access() to authenticated;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_daily_request() to authenticated;
