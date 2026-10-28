-- Keep previously generated 20/25-question attempts readable and submit-ready,
-- while restricting every new exam attempt to 5, 10, or 15 questions.
alter table public.exam_attempts
  add column if not exists legacy_question_count boolean not null default false;

update public.exam_attempts
set legacy_question_count = true
where question_count not in (5, 10, 15);

alter table public.exam_attempts
  drop constraint if exists exam_attempts_question_count_check;

alter table public.exam_attempts
  add constraint exam_attempts_question_count_check
  check (question_count in (5, 10, 15) or legacy_question_count);

create or replace function public.enforce_exam_question_count_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.question_count not in (5, 10, 15) then
      raise exception using errcode = '23514', message = 'New exam attempts may contain at most 15 questions';
    end if;
    new.legacy_question_count := false;
  elsif old.legacy_question_count then
    if new.question_count <> old.question_count then
      raise exception using errcode = '23514', message = 'The question count of a previous exam attempt cannot be changed';
    end if;
    new.legacy_question_count := true;
  else
    if new.question_count not in (5, 10, 15) then
      raise exception using errcode = '23514', message = 'New exam attempts may contain at most 15 questions';
    end if;
    new.legacy_question_count := false;
  end if;

  return new;
end;
$$;

drop trigger if exists exam_attempts_enforce_question_count on public.exam_attempts;
create trigger exam_attempts_enforce_question_count
  before insert or update on public.exam_attempts
  for each row execute function public.enforce_exam_question_count_limit();
