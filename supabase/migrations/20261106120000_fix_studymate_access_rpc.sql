-- Fix ambiguous plan_key references in get_studymate_access().
-- The RETURNS TABLE output column is also named plan_key, so source columns
-- must be qualified to prevent PL/pgSQL from rejecting the RPC as ambiguous.
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

  select entitlement.* into v_entitlement
  from public.study_entitlements as entitlement
  where entitlement.user_id = v_user_id;
  v_premium := found and v_entitlement.expires_at > now();

  select jsonb_build_object(
      'id', payment_request.id,
      'requestCode', payment_request.request_code,
      'planKey', payment_request.plan_key,
      'amountPkr', payment_request.amount_pkr,
      'status', payment_request.status,
      'createdAt', payment_request.created_at
    )
    into v_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id
      and payment_request.status = 'pending'
    order by payment_request.created_at desc
    limit 1;

  select jsonb_build_object(
      'id', payment_request.id,
      'requestCode', payment_request.request_code,
      'planKey', payment_request.plan_key,
      'amountPkr', payment_request.amount_pkr,
      'status', payment_request.status,
      'createdAt', payment_request.created_at,
      'reviewedAt', payment_request.reviewed_at,
      'reviewNote', payment_request.review_note
    )
    into v_latest_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id
    order by payment_request.created_at desc
    limit 1;

  return query select
    public.is_studymate_admin(),
    case
      when v_premium then v_entitlement.plan_key
      when public.is_studymate_admin() then 'admin'
      else 'free'
    end,
    v_premium,
    case when v_premium then v_entitlement.started_at else null end,
    v_entitlement.expires_at,
    case when v_premium or public.is_studymate_admin() then 30 else 10 end,
    v_request,
    v_latest_request;
end;
$$;

revoke all on function public.get_studymate_access() from public, anon;
grant execute on function public.get_studymate_access() to authenticated;
