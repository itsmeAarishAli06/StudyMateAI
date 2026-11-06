-- Let StudyMate admins grant or extend Premium directly from the student directory.
-- This is additive and records each change in the existing entitlement event log.

create or replace function public.admin_grant_study_access(
  p_user_id uuid,
  p_plan_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_previous public.study_entitlements%rowtype;
  v_email_confirmed_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_days integer;
  v_start timestamptz;
  v_entitlement_start timestamptz;
  v_expiry timestamptz;
  v_action text;
begin
  if v_admin is null or not public.is_studymate_admin() then
    raise exception using errcode = '42501', message = 'Admin access required';
  end if;
  if p_user_id is null or p_plan_key is null or p_plan_key not in ('weekly', 'monthly') then
    raise exception using errcode = '22023', message = 'Choose a valid student and plan';
  end if;
  if exists (select 1 from public.studymate_admins as admins where admins.user_id = p_user_id) then
    raise exception using errcode = '22023', message = 'Admin accounts already have lifetime Premium access';
  end if;
  if exists (
    select 1 from public.study_payment_requests as payment_request
    where payment_request.user_id = p_user_id and payment_request.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'Review this student payment request before granting access manually';
  end if;

  select users.email_confirmed_at into v_email_confirmed_at
  from auth.users as users
  where users.id = p_user_id;
  if not found or v_email_confirmed_at is null then
    raise exception using errcode = 'P0002', message = 'Student account not found or email not confirmed';
  end if;

  -- Serialize consecutive manual grants to the same account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 61403));
  v_now := clock_timestamp();

  select * into v_previous
  from public.study_entitlements as entitlement
  where entitlement.user_id = p_user_id
  for update;

  v_days := case when p_plan_key = 'weekly' then 7 else 30 end;
  if found and v_previous.expires_at > v_now then
    v_start := v_previous.expires_at;
    v_entitlement_start := v_previous.started_at;
    v_action := 'extend';
  else
    v_start := v_now;
    v_entitlement_start := v_now;
    v_action := 'grant';
  end if;
  v_expiry := v_start + pg_catalog.make_interval(days => v_days);

  insert into public.study_entitlements as existing_entitlement (user_id, plan_key, started_at, expires_at, granted_by, updated_at)
    values (p_user_id, p_plan_key, v_entitlement_start, v_expiry, v_admin, v_now)
    on conflict (user_id) do update set
      plan_key = excluded.plan_key,
      started_at = case
        when existing_entitlement.expires_at > v_now then existing_entitlement.started_at
        else excluded.started_at
      end,
      expires_at = case
        when existing_entitlement.expires_at > v_now
          then existing_entitlement.expires_at + pg_catalog.make_interval(days => v_days)
        else excluded.expires_at
      end,
      granted_by = excluded.granted_by,
      updated_at = excluded.updated_at
    returning started_at, expires_at into v_entitlement_start, v_expiry;

  v_start := v_expiry - pg_catalog.make_interval(days => v_days);
  v_action := case when v_start > v_now then 'extend' else 'grant' end;

  insert into public.study_entitlement_events (admin_user_id, target_user_id, action, details)
    values (v_admin, p_user_id, v_action,
      jsonb_build_object('planKey', p_plan_key, 'days', v_days, 'expiresAt', v_expiry, 'source', 'admin_manual_grant'));

  return jsonb_build_object(
    'status', v_action,
    'planKey', p_plan_key,
    'days', v_days,
    'startedAt', v_entitlement_start,
    'expiresAt', v_expiry
  );
end;
$$;

revoke all on function public.admin_grant_study_access(uuid, text) from public, anon;
grant execute on function public.admin_grant_study_access(uuid, text) to authenticated;
