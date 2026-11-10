-- Friends Premium: pay for three accounts and grant the same duration to four.
-- Additive to existing individual payment requests and entitlement data.

alter table public.study_payment_requests
  add column if not exists offer_type text not null default 'single',
  add column if not exists recipient_user_ids uuid[] not null default '{}'::uuid[];

alter table public.study_payment_requests
  drop constraint if exists study_payment_requests_amount_pkr_check,
  drop constraint if exists study_payment_requests_check;

alter table public.study_payment_requests
  add constraint study_payment_requests_offer_type_check
    check (offer_type in ('single', 'friends')),
  add constraint study_payment_requests_offer_amount_check
    check (
      (offer_type = 'single' and plan_key = 'weekly' and amount_pkr = 200)
      or (offer_type = 'single' and plan_key = 'monthly' and amount_pkr = 550)
      or (offer_type = 'friends' and plan_key = 'weekly' and amount_pkr = 600)
      or (offer_type = 'friends' and plan_key = 'monthly' and amount_pkr = 1650)
    ),
  add constraint study_payment_requests_recipients_check
    check (
      (offer_type = 'single' and cardinality(recipient_user_ids) = 0)
      or (offer_type = 'friends' and cardinality(recipient_user_ids) = 4)
    );

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
      'offerType', payment_request.offer_type,
      'recipientEmails', case when payment_request.offer_type = 'friends' then (
        select coalesce(jsonb_agg(user_record.email::text order by user_record.email), '[]'::jsonb)
        from unnest(payment_request.recipient_user_ids) as recipient(user_id)
        join auth.users as user_record on user_record.id = recipient.user_id
      ) else '[]'::jsonb end,
      'amountPkr', payment_request.amount_pkr,
      'status', payment_request.status,
      'createdAt', payment_request.created_at
    )
    into v_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id and payment_request.status = 'pending'
    order by payment_request.created_at desc limit 1;

  select jsonb_build_object(
      'id', payment_request.id,
      'requestCode', payment_request.request_code,
      'planKey', payment_request.plan_key,
      'offerType', payment_request.offer_type,
      'recipientEmails', case when payment_request.offer_type = 'friends' then (
        select coalesce(jsonb_agg(user_record.email::text order by user_record.email), '[]'::jsonb)
        from unnest(payment_request.recipient_user_ids) as recipient(user_id)
        join auth.users as user_record on user_record.id = recipient.user_id
      ) else '[]'::jsonb end,
      'amountPkr', payment_request.amount_pkr,
      'status', payment_request.status,
      'createdAt', payment_request.created_at,
      'reviewedAt', payment_request.reviewed_at,
      'reviewNote', payment_request.review_note
    )
    into v_latest_request
    from public.study_payment_requests as payment_request
    where payment_request.user_id = v_user_id
    order by payment_request.created_at desc limit 1;

  return query select
    public.is_studymate_admin(),
    case when v_premium then v_entitlement.plan_key when public.is_studymate_admin() then 'admin' else 'free' end,
    v_premium,
    case when v_premium then v_entitlement.started_at else null end,
    v_entitlement.expires_at,
    case when v_premium or public.is_studymate_admin() then 30 else 10 end,
    v_request,
    v_latest_request;
end;
$$;

create or replace function public.create_study_friends_payment_request(
  p_plan_key text,
  p_friend_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_friend_id uuid;
  v_confirmed_at timestamptz;
  v_members uuid[];
  v_emails jsonb;
  v_amount integer;
  v_row public.study_payment_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_plan_key is null or p_plan_key not in ('weekly', 'monthly') then
    raise exception using errcode = '22023', message = 'Choose a valid Friends plan duration';
  end if;
  if p_friend_emails is null or cardinality(p_friend_emails) <> 3 then
    raise exception using errcode = '22023', message = 'Enter exactly three friends’ StudyMate account emails';
  end if;

  v_members := array[v_user_id];
  foreach v_email in array p_friend_emails loop
    v_email := lower(btrim(v_email));
    if char_length(v_email) > 254 or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then
      raise exception using errcode = '22023', message = 'Enter valid email addresses for all three friends';
    end if;
    if exists (
      select 1 from unnest(p_friend_emails) as input(email)
      where lower(btrim(input.email)) = v_email
      group by lower(btrim(input.email)) having count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'Each friend must use a different StudyMate account';
    end if;
    if exists (
      select 1 from auth.users as buyer
      where buyer.id = v_user_id and lower(buyer.email) = v_email
    ) then
      raise exception using errcode = '22023', message = 'Enter three friends’ accounts; your account is included automatically';
    end if;

    select user_record.id, user_record.email_confirmed_at
      into v_friend_id, v_confirmed_at
      from auth.users as user_record
      where lower(user_record.email) = v_email
      limit 1;
    if not found or v_confirmed_at is null then
      raise exception using errcode = 'P0002', message = 'A friend account is not registered and email-confirmed yet';
    end if;
    v_members := array_append(v_members, v_friend_id);
  end loop;

  if cardinality(v_members) <> 4 or (select count(distinct member_id) from unnest(v_members) as members(member_id)) <> 4 then
    raise exception using errcode = '22023', message = 'All four plan members must be different accounts';
  end if;

  v_amount := case when p_plan_key = 'weekly' then 600 else 1650 end;
  insert into public.study_payment_requests (user_id, plan_key, amount_pkr, offer_type, recipient_user_ids)
    values (v_user_id, p_plan_key, v_amount, 'friends', v_members)
    returning * into v_row;

  select coalesce(jsonb_agg(user_record.email::text order by user_record.email), '[]'::jsonb)
    into v_emails
    from unnest(v_members) as recipient(user_id)
    join auth.users as user_record on user_record.id = recipient.user_id;

  return jsonb_build_object(
    'id', v_row.id,
    'requestCode', v_row.request_code,
    'planKey', v_row.plan_key,
    'offerType', v_row.offer_type,
    'recipientEmails', v_emails,
    'amountPkr', v_row.amount_pkr,
    'status', v_row.status,
    'createdAt', v_row.created_at
  );
end;
$$;

-- Keep the original admin API available for individual requests only. This
-- prevents the legacy approval action from granting only the purchaser on a
-- four-account request.
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
    where r.offer_type = 'single'
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
  if v_request.offer_type <> 'single' then
    raise exception using errcode = '22023', message = 'Use the Friends review action to process all four accounts together';
  end if;

  if p_decision = 'reject' then
    update public.study_payment_requests set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin,
      transaction_reference = null, review_note = nullif(btrim(p_review_note), '') where id = v_request.id;
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

create or replace function public.admin_list_study_friends_payment_requests()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_studymate_admin() then
    raise exception using errcode = '42501', message = 'Admin access required';
  end if;

  return query
    select jsonb_build_object(
      'id', payment_request.id,
      'request_code', payment_request.request_code,
      'user_id', payment_request.user_id,
      'user_email', buyer.email::text,
      'plan_key', payment_request.plan_key,
      'offer_type', payment_request.offer_type,
      'amount_pkr', payment_request.amount_pkr,
      'status', payment_request.status,
      'transaction_reference', payment_request.transaction_reference,
      'created_at', payment_request.created_at,
      'current_expires_at', buyer_entitlement.expires_at,
      'members', members.member_list
    )
    from public.study_payment_requests as payment_request
    join auth.users as buyer on buyer.id = payment_request.user_id
    left join public.study_entitlements as buyer_entitlement on buyer_entitlement.user_id = buyer.id
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', recipient.user_id,
        'email', member.email::text,
        'name', nullif(btrim(profile.full_name), '')
      ) order by member.email), '[]'::jsonb) as member_list
      from unnest(payment_request.recipient_user_ids) as recipient(user_id)
      join auth.users as member on member.id = recipient.user_id
      left join public.student_profiles as profile on profile.user_id = recipient.user_id
    ) as members
    where payment_request.offer_type = 'friends'
    order by case payment_request.status when 'pending' then 0 else 1 end, payment_request.created_at desc
    limit 200;
end;
$$;

create or replace function public.admin_review_study_friends_payment_request(
  p_request_id uuid,
  p_decision text,
  p_transaction_reference text default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.study_payment_requests%rowtype;
  v_member_id uuid;
  v_previous public.study_entitlements%rowtype;
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_entitlement_start timestamptz;
  v_expiry timestamptz;
  v_days integer;
  v_action text;
  v_granted integer := 0;
begin
  if v_admin is null or not public.is_studymate_admin() then
    raise exception using errcode = '42501', message = 'Admin access required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Choose approve or reject';
  end if;
  if p_transaction_reference is not null and char_length(p_transaction_reference) > 120 then
    raise exception using errcode = '22023', message = 'Transaction reference is too long';
  end if;
  if p_review_note is not null and char_length(p_review_note) > 300 then
    raise exception using errcode = '22023', message = 'Review note is too long';
  end if;
  if p_decision = 'approve' and nullif(btrim(p_transaction_reference), '') is null then
    raise exception using errcode = '22023', message = 'Enter the verified transaction reference before approving';
  end if;

  select * into v_request
    from public.study_payment_requests
    where id = p_request_id and offer_type = 'friends'
    for update;
  if not found or v_request.status <> 'pending' then
    raise exception using errcode = 'P0002', message = 'Pending Friends payment request not found';
  end if;
  if cardinality(v_request.recipient_user_ids) <> 4 then
    raise exception using errcode = '22023', message = 'This Friends request does not contain four eligible accounts';
  end if;

  if p_decision = 'reject' then
    update public.study_payment_requests
      set status = 'rejected', reviewed_at = v_now, reviewed_by = v_admin,
          transaction_reference = null, review_note = nullif(btrim(p_review_note), '')
      where id = v_request.id;
    insert into public.study_entitlement_events (admin_user_id, target_user_id, request_id, action, details)
      values (v_admin, v_request.user_id, v_request.id, 'reject',
        jsonb_build_object('offerType', 'friends', 'planKey', v_request.plan_key, 'members', v_request.recipient_user_ids));
    return jsonb_build_object('status', 'rejected');
  end if;

  if exists (
    select 1 from unnest(v_request.recipient_user_ids) as recipient(user_id)
    left join auth.users as member on member.id = recipient.user_id
    where member.id is null or member.email_confirmed_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'A Friends account is no longer eligible for access';
  end if;

  -- Lock all current entitlements in a stable order before changing any of them.
  perform entitlement.user_id
    from public.study_entitlements as entitlement
    where entitlement.user_id = any(v_request.recipient_user_ids)
    order by entitlement.user_id
    for update;

  v_days := case when v_request.plan_key = 'weekly' then 7 else 30 end;
  foreach v_member_id in array v_request.recipient_user_ids loop
    select * into v_previous
      from public.study_entitlements
      where user_id = v_member_id;
    v_start := case when found and v_previous.expires_at > v_now then v_previous.expires_at else v_now end;
    v_entitlement_start := case when found and v_previous.expires_at > v_now then v_previous.started_at else v_now end;
    v_expiry := v_start + make_interval(days => v_days);

    insert into public.study_entitlements (user_id, plan_key, started_at, expires_at, granted_by, updated_at)
      values (v_member_id, v_request.plan_key, v_entitlement_start, v_expiry, v_admin, v_now)
      on conflict (user_id) do update set
        plan_key = excluded.plan_key,
        started_at = excluded.started_at,
        expires_at = excluded.expires_at,
        granted_by = excluded.granted_by,
        updated_at = excluded.updated_at;

    v_action := case when v_previous.user_id is not null and v_previous.expires_at > v_now then 'extend' else 'grant' end;
    insert into public.study_entitlement_events (admin_user_id, target_user_id, request_id, action, details)
      values (v_admin, v_member_id, v_request.id, v_action,
        jsonb_build_object('offerType', 'friends', 'planKey', v_request.plan_key, 'days', v_days, 'expiresAt', v_expiry));
    v_granted := v_granted + 1;
  end loop;

  update public.study_payment_requests
    set status = 'approved', reviewed_at = v_now, reviewed_by = v_admin,
        transaction_reference = nullif(btrim(p_transaction_reference), ''),
        review_note = nullif(btrim(p_review_note), '')
    where id = v_request.id;

  return jsonb_build_object(
    'status', 'approved',
    'offerType', 'friends',
    'planKey', v_request.plan_key,
    'grantedCount', v_granted,
    'startedAt', v_now,
    'expiresAt', v_expiry
  );
end;
$$;

revoke all on function public.create_study_friends_payment_request(text, text[]) from public, anon;
revoke all on function public.admin_list_study_friends_payment_requests() from public, anon;
revoke all on function public.admin_review_study_friends_payment_request(uuid, text, text, text) from public, anon;
grant execute on function public.create_study_friends_payment_request(text, text[]) to authenticated;
grant execute on function public.admin_list_study_friends_payment_requests() to authenticated;
grant execute on function public.admin_review_study_friends_payment_request(uuid, text, text, text) to authenticated;

