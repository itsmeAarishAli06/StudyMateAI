-- Updated pricing for new individual and Friends Premium requests.
-- Existing requests keep their recorded amounts and remain reviewable.

alter table public.study_payment_requests
  drop constraint if exists study_payment_requests_offer_amount_check;

alter table public.study_payment_requests
  add constraint study_payment_requests_offer_amount_check
    check (
      -- Current prices, plus the previous values for existing requests.
      (offer_type = 'single' and plan_key = 'weekly' and amount_pkr in (150, 200))
      or (offer_type = 'single' and plan_key = 'monthly' and amount_pkr in (500, 550))
      or (offer_type = 'friends' and plan_key = 'weekly' and amount_pkr in (450, 600))
      or (offer_type = 'friends' and plan_key = 'monthly' and amount_pkr in (1500, 1650))
    );

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
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_plan_key is null or p_plan_key not in ('weekly', 'monthly') then
    raise exception using errcode = '22023', message = 'Choose a valid plan';
  end if;

  v_amount := case when p_plan_key = 'weekly' then 150 else 500 end;
  insert into public.study_payment_requests (user_id, plan_key, amount_pkr)
    values (v_user_id, p_plan_key, v_amount)
    returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'requestCode', v_row.request_code,
    'planKey', v_row.plan_key,
    'amountPkr', v_row.amount_pkr,
    'status', v_row.status,
    'createdAt', v_row.created_at
  );
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
    raise exception using errcode = '22023', message = 'Enter exactly three friends StudyMate account emails';
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
      raise exception using errcode = '22023', message = 'Enter three friend accounts; your account is included automatically';
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

  v_amount := case when p_plan_key = 'weekly' then 450 else 1500 end;
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
