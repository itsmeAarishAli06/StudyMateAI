-- Add explicit difficulty and shorter timed-exam choices without invalidating
-- previously saved attempts that used the former 10–180 minute durations.
alter table public.exam_attempts
  add column if not exists difficulty text not null default 'standard',
  add column if not exists legacy_exam_duration boolean not null default false;

update public.exam_attempts
set legacy_exam_duration = true
where duration_minutes not in (1, 3, 5, 10, 15, 20);

alter table public.exam_attempts
  drop constraint if exists exam_attempts_duration_minutes_check;

alter table public.exam_attempts
  add constraint exam_attempts_duration_minutes_check
  check (duration_minutes in (1, 3, 5, 10, 15, 20) or legacy_exam_duration);

alter table public.exam_attempts
  drop constraint if exists exam_attempts_difficulty_check;

alter table public.exam_attempts
  add constraint exam_attempts_difficulty_check
  check (difficulty in ('easy', 'standard', 'challenging'));

create or replace function public.enforce_exam_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.difficulty not in ('easy', 'standard', 'challenging') then
    raise exception using errcode = '23514', message = 'Exam difficulty must be easy, standard, or challenging';
  end if;

  if tg_op = 'INSERT' then
    if new.duration_minutes not in (1, 3, 5, 10, 15, 20) then
      raise exception using errcode = '23514', message = 'New exam attempts must use an allowed duration';
    end if;
    new.legacy_exam_duration := false;
  elsif old.legacy_exam_duration then
    if new.duration_minutes <> old.duration_minutes then
      raise exception using errcode = '23514', message = 'The duration of a previous exam attempt cannot be changed';
    end if;
    new.legacy_exam_duration := true;
  else
    if new.duration_minutes not in (1, 3, 5, 10, 15, 20) then
      raise exception using errcode = '23514', message = 'New exam attempts must use an allowed duration';
    end if;
    new.legacy_exam_duration := false;
  end if;

  return new;
end;
$$;

drop trigger if exists exam_attempts_enforce_settings on public.exam_attempts;
create trigger exam_attempts_enforce_settings
  before insert or update on public.exam_attempts
  for each row execute function public.enforce_exam_settings();
