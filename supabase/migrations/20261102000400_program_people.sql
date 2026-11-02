-- ============================================================
--  NACBA Webinar Docket — people on a program, any role
--  Run in the SQL editor of the NACBA Supabase project. Safe to re-run.
--
--  WHY THIS REPLACES WHAT SHIPPED YESTERDAY
--  20261102000300 put the people in two columns on `programs`:
--  coordinator_email and moderator_email. That only works while there are
--  exactly two roles. Marketing makes it three, the EMC chair four, and
--  each one would need its own column, its own migration and its own line
--  in every query. So the pair becomes a table keyed on the role.
--
--  Nothing is lost: both columns are copied in below before anything else
--  happens, and the columns themselves are LEFT IN PLACE — see the note at
--  the bottom for why, and when they can go.
-- ============================================================

-- ---------- 1. the table ----------
create table if not exists program_people (
  program_id uuid not null references programs(id) on delete cascade,
  role       text not null,
  email      text not null default '',
  set_at     timestamptz not null default now(),
  set_by     text not null default '',
  primary key (program_id, role)
);

comment on table program_people is
  'Who holds a given role on a given program. `role` is lower case and is '
  'matched against tasks.owner_role to decide who inherits a task.';
comment on column program_people.email is
  'Empty means the role is explicitly nobody, which is different from no row at all.';

create index if not exists program_people_email_idx on program_people (email);

alter table program_people enable row level security;

drop policy if exists program_people_read  on program_people;
drop policy if exists program_people_write on program_people;
create policy program_people_read on program_people
  for select to authenticated using (public.is_allowed());
create policy program_people_write on program_people
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- Keep role comparable and stamp who did it, the way invites and task
-- completions are already stamped.
create or replace function public.stamp_program_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.role  := lower(btrim(new.role));
  new.email := lower(btrim(coalesce(new.email, '')));
  new.set_at := now();
  if coalesce(new.set_by, '') = '' then
    new.set_by := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_program_person on program_people;
create trigger trg_stamp_program_person
  before insert or update on program_people
  for each row execute function public.stamp_program_person();

-- ---------- 2. carry the two columns across, before anything else ----------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='programs'
                and column_name='coordinator_email') then
    insert into program_people (program_id, role, email)
    select id, 'coordinator', coordinator_email
      from programs where coalesce(coordinator_email,'') <> ''
    on conflict (program_id, role) do nothing;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='programs'
                and column_name='moderator_email') then
    insert into program_people (program_id, role, email)
    select id, 'moderator', moderator_email
      from programs where coalesce(moderator_email,'') <> ''
    on conflict (program_id, role) do nothing;
  end if;
end $$;

-- ---------- 3. the inheritance rule, now a lookup ----------
-- The old three-argument form is replaced, not overloaded: leaving both
-- visible is how the trigger and the app end up disagreeing.
drop function if exists public.inherit_assignee(text, text, text);

create or replace function public.inherit_assignee(pid uuid, orole text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pp.email
       from program_people pp
      where pp.program_id = pid
        and pp.role = lower(btrim(coalesce(orole, '')))
      limit 1),
    '');
$$;

-- ---------- 4. a new task still inherits on the way in ----------
create or replace function public.stamp_task_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_email <> '' then
    return new;                       -- an explicit value wins
  end if;
  new.assignee_email := public.inherit_assignee(new.program_id, new.owner_role);
  return new;
end $$;

drop trigger if exists trg_stamp_task_assignee on tasks;
create trigger trg_stamp_task_assignee
  before insert on tasks
  for each row execute function public.stamp_task_assignee();

-- ---------- 5. re-cascade now hangs off program_people ----------
-- It fires per role, so changing the marketing contact cannot disturb the
-- tasks that belong to the coordinator.
drop trigger  if exists trg_recascade_assignees on programs;
drop function if exists public.recascade_assignees();

create or replace function public.recascade_from_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; r text;
begin
  pid := coalesce(new.program_id, old.program_id);
  r   := lower(btrim(coalesce(new.role, old.role)));
  update tasks t
     set assignee_email = public.inherit_assignee(pid, t.owner_role)
   where t.program_id = pid
     and lower(btrim(t.owner_role)) = r
     and not t.assignee_set;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_recascade_from_people on program_people;
create trigger trg_recascade_from_people
  after insert or update or delete on program_people
  for each row execute function public.recascade_from_people();

-- ---------- 6. re-flow everything inherited, once ----------
update tasks t
   set assignee_email = public.inherit_assignee(t.program_id, t.owner_role)
  from programs p
 where p.id = t.program_id
   and not t.assignee_set
   and t.assignee_email is distinct from public.inherit_assignee(t.program_id, t.owner_role);

-- ============================================================
--  NOTE ON programs.coordinator_email / moderator_email
--  They are deliberately still here. The live site selects them, and
--  loadData throws rather than degrades, so dropping them before the new
--  code is pushed would blank the portal. Once the matching push is live
--  they are dead weight and can go with:
--      alter table programs drop column coordinator_email;
--      alter table programs drop column moderator_email;
--  There is no hurry, and nothing reads them after this migration.
-- ============================================================


-- ---------- did it work ----------
select 'program_people table' as check,
       count(*) as columns_present
  from information_schema.columns
 where table_schema = 'public' and table_name = 'program_people';

select 'rows carried over from the two columns' as check,
       count(*) filter (where role = 'coordinator') as coordinators,
       count(*) filter (where role = 'moderator')   as moderators,
       count(*)                                     as total
  from program_people;

select 'the lookup replaced the old rule' as check,
       count(*) filter (where pronargs = 2) as two_arg_version_present,
       count(*) filter (where pronargs = 3) as old_version_should_be_zero
  from pg_proc
 where proname = 'inherit_assignee';

select 'triggers' as check,
       count(*) filter (where tgname = 'trg_stamp_task_assignee')   as on_task_insert,
       count(*) filter (where tgname = 'trg_recascade_from_people') as on_people_change,
       count(*) filter (where tgname = 'trg_stamp_program_person')  as stamping
  from pg_trigger
 where not tgisinternal;

select 'assigned tasks' as check,
       count(*) filter (where assignee_email <> '')              as named,
       count(*) filter (where assignee_email =  '')              as unnamed,
       count(*) filter (where assignee_set)                      as pinned_by_hand
  from tasks;
