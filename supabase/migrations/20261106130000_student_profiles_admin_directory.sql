-- Student contact profiles and a private, paginated admin directory.
-- Existing accounts receive an empty/incomplete profile row; no auth or study data is deleted.

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  class_name text,
  phone_e164 text,
  whatsapp_phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profiles_full_name_check check (full_name is null or char_length(full_name) between 2 and 100),
  constraint student_profiles_class_name_check check (class_name is null or char_length(class_name) between 1 and 80),
  constraint student_profiles_phone_check check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint student_profiles_whatsapp_check check (whatsapp_phone_e164 is null or whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create index if not exists student_profiles_name_idx
  on public.student_profiles (lower(full_name));

-- Backfill all existing Auth accounts. Missing or malformed metadata stays null and
-- is shown as an incomplete profile for the student to finish after signing in.
insert into public.student_profiles (user_id, full_name, class_name, phone_e164, whatsapp_phone_e164)
select
  users.id,
  case when char_length(regexp_replace(btrim(coalesce(users.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g')) between 2 and 100
    then regexp_replace(btrim(users.raw_user_meta_data ->> 'full_name'), '\s+', ' ', 'g') end,
  case when char_length(regexp_replace(btrim(coalesce(users.raw_user_meta_data ->> 'class_name', '')), '\s+', ' ', 'g')) between 1 and 80
    then regexp_replace(btrim(users.raw_user_meta_data ->> 'class_name'), '\s+', ' ', 'g') end,
  case when users.raw_user_meta_data ->> 'phone_e164' ~ '^\+[1-9][0-9]{7,14}$' then users.raw_user_meta_data ->> 'phone_e164' end,
  case when users.raw_user_meta_data ->> 'whatsapp_phone_e164' ~ '^\+[1-9][0-9]{7,14}$' then users.raw_user_meta_data ->> 'whatsapp_phone_e164' end
from auth.users as users
on conflict (user_id) do nothing;

create or replace function public.touch_student_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_profiles_touch_updated_at on public.student_profiles;
create trigger student_profiles_touch_updated_at
  before update on public.student_profiles
  for each row execute function public.touch_student_profile_updated_at();

-- New signups must contain a valid profile. Existing accounts are not affected.
create or replace function public.create_studymate_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g');
  v_class text := regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'class_name', '')), '\s+', ' ', 'g');
  v_phone text := coalesce(new.raw_user_meta_data ->> 'phone_e164', '');
  v_whatsapp text := coalesce(new.raw_user_meta_data ->> 'whatsapp_phone_e164', '');
begin
  if char_length(v_name) not between 2 and 100
    or char_length(v_class) not between 1 and 80
    or v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '23514', message = 'Complete your StudyMate profile with a valid name, class, and international phone numbers.';
  end if;

  insert into public.student_profiles (user_id, full_name, class_name, phone_e164, whatsapp_phone_e164)
  values (new.id, v_name, v_class, v_phone, v_whatsapp);
  return new;
end;
$$;

drop trigger if exists studymate_create_student_profile on auth.users;
create trigger studymate_create_student_profile
  after insert on auth.users
  for each row execute function public.create_studymate_student_profile();

alter table public.student_profiles enable row level security;
revoke all on public.student_profiles from public, anon, authenticated;
grant select, update on public.student_profiles to authenticated;

drop policy if exists "Students can read their own profile" on public.student_profiles;
create policy "Students can read their own profile" on public.student_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Students can update their own profile" on public.student_profiles;
create policy "Students can update their own profile" on public.student_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.admin_list_studymate_students(
  p_status text default 'all',
  p_search text default '',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_total bigint := 0;
  v_all bigint := 0;
  v_premium bigint := 0;
  v_free bigint := 0;
  v_admins bigint := 0;
  v_students jsonb := '[]'::jsonb;
begin
  if not public.is_studymate_admin() then
    raise exception using errcode = '42501', message = 'Admin access required';
  end if;
  if p_status is null or p_search is null or p_limit is null or p_offset is null
    or p_status not in ('all', 'premium', 'free')
    or char_length(v_search) > 100
    or p_limit not between 1 and 100
    or p_offset not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'Invalid student directory filters';
  end if;

  with directory as (
    select
      users.id as user_id,
      users.email::text as email,
      users.created_at,
      users.last_sign_in_at,
      profile.full_name,
      profile.class_name,
      profile.phone_e164,
      profile.whatsapp_phone_e164,
      entitlement.plan_key,
      entitlement.started_at,
      entitlement.expires_at,
      case
        when exists (select 1 from public.studymate_admins as admins where admins.user_id = users.id) then 'admin'
        when entitlement.expires_at > now() then 'premium'
        else 'free'
      end as account_status
    from auth.users as users
    left join public.student_profiles as profile on profile.user_id = users.id
    left join public.study_entitlements as entitlement on entitlement.user_id = users.id
  )
  select count(*),
    count(*) filter (where directory.account_status = 'premium'),
    count(*) filter (where directory.account_status = 'free'),
    count(*) filter (where directory.account_status = 'admin')
    into v_all, v_premium, v_free, v_admins
  from directory;

  with directory as (
    select
      users.id as user_id,
      users.email::text as email,
      users.created_at,
      users.last_sign_in_at,
      profile.full_name,
      profile.class_name,
      profile.phone_e164,
      profile.whatsapp_phone_e164,
      case
        when exists (select 1 from public.studymate_admins as admins where admins.user_id = users.id) then 'admin'
        when entitlement.expires_at > now() then 'premium'
        else 'free'
      end as account_status,
      case
        when exists (select 1 from public.studymate_admins as admins where admins.user_id = users.id) then 'admin'
        when entitlement.expires_at > now() then entitlement.plan_key
        else 'free'
      end as plan_key,
      entitlement.started_at,
      entitlement.expires_at
    from auth.users as users
    left join public.student_profiles as profile on profile.user_id = users.id
    left join public.study_entitlements as entitlement on entitlement.user_id = users.id
  )
  select count(*) into v_total
  from directory
  where (p_status = 'all' or directory.account_status = p_status)
    and (v_search = '' or concat_ws(' ', directory.email, directory.full_name, directory.class_name,
      directory.phone_e164, directory.whatsapp_phone_e164) ilike '%' || v_search || '%');

  with directory as (
    select
      users.id as user_id,
      users.email::text as email,
      users.created_at,
      users.last_sign_in_at,
      profile.full_name,
      profile.class_name,
      profile.phone_e164,
      profile.whatsapp_phone_e164,
      case
        when exists (select 1 from public.studymate_admins as admins where admins.user_id = users.id) then 'admin'
        when entitlement.expires_at > now() then 'premium'
        else 'free'
      end as account_status,
      case
        when exists (select 1 from public.studymate_admins as admins where admins.user_id = users.id) then 'admin'
        when entitlement.expires_at > now() then entitlement.plan_key
        else 'free'
      end as plan_key,
      entitlement.started_at,
      entitlement.expires_at
    from auth.users as users
    left join public.student_profiles as profile on profile.user_id = users.id
    left join public.study_entitlements as entitlement on entitlement.user_id = users.id
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.user_id), '[]'::jsonb)
    into v_students
  from (
    select directory.*
    from directory
    where (p_status = 'all' or directory.account_status = p_status)
      and (v_search = '' or concat_ws(' ', directory.email, directory.full_name, directory.class_name,
        directory.phone_e164, directory.whatsapp_phone_e164) ilike '%' || v_search || '%')
    order by directory.created_at desc, directory.user_id
    limit p_limit offset p_offset
  ) as page;

  return jsonb_build_object(
    'students', v_students,
    'total', v_total,
    'counts', jsonb_build_object('all', v_all, 'premium', v_premium, 'free', v_free, 'admins', v_admins)
  );
end;
$$;

revoke all on function public.touch_student_profile_updated_at() from public, anon, authenticated;
revoke all on function public.create_studymate_student_profile() from public, anon, authenticated;
revoke all on function public.admin_list_studymate_students(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_studymate_students(text, text, integer, integer) to authenticated;
