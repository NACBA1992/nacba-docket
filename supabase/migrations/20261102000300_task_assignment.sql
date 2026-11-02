-- ============================================================
--  NACBA Webinar Docket — task assignment
--  Run in the SQL editor of the NACBA Supabase project. Safe to re-run.
--
--  WHY THIS EXISTS
--  `allowed_emails.role` is access ("what may you change") and `title` is
--  the job name. Neither says who owes a particular task on a particular
--  program, and `tasks.owner_role` only ever held a role NAME copied from
--  the template — 'Coordinator', 'Moderator' — never a person. So the
--  docket could say "a Coordinator should do this" and never "Deidre
--  should do this". That is the gap this closes.
--
--  THE SHAPE, which is the docket engine's own pattern:
--    docket_template.owner_role   the RULE      — a Coordinator does this
--    programs.coordinator_email   the PEOPLE    — who that is, this program
--    tasks.assignee_email         the EXCEPTION — overridable task by task
--
--  Exactly how event_date works: set it once, everything follows, and a
--  hand-made change is never clobbered by a later recalculation.
-- ============================================================

-- ---------- 1. the people, per program ----------
alter table programs add column if not exists coordinator_email text not null default '';
alter table programs add column if not exists moderator_email   text not null default '';

comment on column programs.coordinator_email is
  'Who coordinates THIS program. Tasks whose owner_role is Coordinator inherit it.';
comment on column programs.moderator_email is
  'Who moderates THIS program. Tasks whose owner_role is Moderator inherit it.';

-- ---------- 2. the assignment, per task ----------
alter table tasks add column if not exists assignee_email text    not null default '';
alter table tasks add column if not exists assignee_set   boolean not null default false;

comment on column tasks.assignee_email is
  'Who owes this task. Empty means nobody is named yet.';
comment on column tasks.assignee_set is
  'True once a human chose the assignee by hand. Those are never overwritten '
  'when the program''s coordinator or moderator changes.';

-- Finding "everything still open that is mine" is the main read.
create index if not exists tasks_assignee_open_idx
  on tasks (assignee_email) where not done;

-- ---------- 3. the inheritance rule ----------
-- owner_role is free text from the template, so match it loosely.
create or replace function public.inherit_assignee(coord text, modr text, orole text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(orole, '')))
           when 'coordinator' then coalesce(coord, '')
           when 'moderator'   then coalesce(modr, '')
           else ''
         end;
$$;

-- ---------- 4. a new task inherits on the way in ----------
-- generate_docket() inserts a program's tasks after the program row lands,
-- so the program is readable here.
create or replace function public.stamp_task_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare coord text; modr text;
begin
  if new.assignee_email <> '' then
    return new;                       -- an explicit value wins
  end if;
  select p.coordinator_email, p.moderator_email
    into coord, modr
    from programs p
   where p.id = new.program_id;
  new.assignee_email := public.inherit_assignee(coord, modr, new.owner_role);
  return new;
end $$;

drop trigger if exists trg_stamp_task_assignee on tasks;
create trigger trg_stamp_task_assignee
  before insert on tasks
  for each row execute function public.stamp_task_assignee();

-- ---------- 5. changing the people re-flows the inherited tasks ----------
create or replace function public.recascade_assignees()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.coordinator_email is distinct from old.coordinator_email
     or new.moderator_email is distinct from old.moderator_email then
    update tasks t
       set assignee_email = public.inherit_assignee(
             new.coordinator_email, new.moderator_email, t.owner_role)
     where t.program_id = new.id
       and not t.assignee_set;
  end if;
  return new;
end $$;

drop trigger if exists trg_recascade_assignees on programs;
create trigger trg_recascade_assignees
  after update on programs
  for each row execute function public.recascade_assignees();

-- ---------- 6. backfill anything already on the board ----------
-- A no-op until a program names its coordinator, which is correct: there is
-- no one to inherit from yet. Hand-set assignments are left alone.
update tasks t
   set assignee_email = public.inherit_assignee(
         p.coordinator_email, p.moderator_email, t.owner_role)
  from programs p
 where p.id = t.program_id
   and not t.assignee_set
   and t.assignee_email = ''
   and public.inherit_assignee(p.coordinator_email, p.moderator_email, t.owner_role) <> '';

-- ---------- did it work ----------
select 'columns on programs' as check,
       count(*) filter (where column_name = 'coordinator_email') as coordinator,
       count(*) filter (where column_name = 'moderator_email')   as moderator
  from information_schema.columns
 where table_schema = 'public' and table_name = 'programs';

select 'columns on tasks' as check,
       count(*) filter (where column_name = 'assignee_email') as assignee_email,
       count(*) filter (where column_name = 'assignee_set')   as assignee_set
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tasks';

select 'triggers' as check,
       count(*) filter (where tgname = 'trg_stamp_task_assignee') as on_insert,
       count(*) filter (where tgname = 'trg_recascade_assignees') as on_program_update
  from pg_trigger
 where not tgisinternal;

select 'inheritance rule' as check,
       public.inherit_assignee('c@x.org', 'm@x.org', 'Coordinator') as coordinator_gets,
       public.inherit_assignee('c@x.org', 'm@x.org', 'Moderator')   as moderator_gets,
       public.inherit_assignee('c@x.org', 'm@x.org', 'Marketing')   as unmatched_gets;

select 'assigned tasks' as check,
       count(*) filter (where assignee_email <> '') as named,
       count(*) filter (where assignee_email  = '') as unnamed
  from tasks;
