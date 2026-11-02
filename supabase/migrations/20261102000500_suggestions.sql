-- ============================================================
--  NACBA Webinar Docket — suggestions, and the build plan
--  Run in the SQL editor of the NACBA Supabase project. Safe to re-run.
--
--  WHY THIS IS NOT program_ideas
--  program_ideas is for future *programs*: it carries speakers_idea,
--  target_period and a link to the program an idea became, and its
--  statuses end in 'scheduled'. A request to change the portal, or a
--  missing NACBA document, has none of those things. Putting both in
--  one table would mean half the columns are always empty and the
--  Ideas tab stops being a list of webinars we might run.
--
--  So suggestions get their own table, and it doubles as the build
--  plan: the status is where the item sits, not how good it is.
-- ============================================================

-- ---------- 1. the table ----------
create table if not exists suggestions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  detail       text not null default '',
  area         text not null default 'portal'
               check (area in ('portal','process','documents','other')),
  status       text not null default 'new'
               check (status in ('new','considering','planned','done','declined')),
  submitted_by text not null default '',
  decided_note text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table suggestions is
  'Suggestions from staff and committee members, and the build plan they feed. '
  'Program ideas live in program_ideas instead.';
comment on column suggestions.decided_note is
  'Why it was planned or declined. A suggestion box that never answers back '
  'stops being used, so declining without a reason is worse than not asking.';

create index if not exists suggestions_status_idx on suggestions (status, created_at desc);
create index if not exists suggestions_area_idx   on suggestions (area);

alter table suggestions enable row level security;

drop policy if exists suggestions_read  on suggestions;
drop policy if exists suggestions_write on suggestions;
create policy suggestions_read on suggestions
  for select to authenticated using (public.is_allowed());
create policy suggestions_write on suggestions
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- ---------- 2. who asked, and when it last moved ----------
create or replace function public.stamp_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.submitted_by = '' then
    new.submitted_by := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_stamp_suggestion on suggestions;
create trigger trg_stamp_suggestion before insert or update on suggestions
  for each row execute function public.stamp_suggestion();

-- ---------- 3. teach the change log about this table ----------
--  log_changes() resolves a label per table and its final ELSE reads
--  full_name. Without a branch here every suggestion would be logged
--  with a blank label, which is the same trap the ideas migration
--  documented. This is the metrics.sql version with one branch added;
--  every existing branch is carried over unchanged.
create or replace function public.log_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text; o jsonb; n jsonb; cur jsonb; who text; pid uuid; rid uuid; lbl text;
begin
  who := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
  if tg_op = 'DELETE' then cur := to_jsonb(old); else cur := to_jsonb(new); end if;
  rid := (cur ->> 'id')::uuid;

  if tg_table_name = 'programs' then
    pid := rid; lbl := cur ->> 'title';
  elsif tg_table_name = 'program_speakers' then
    pid := (cur ->> 'program_id')::uuid;
    select s.full_name into lbl from speakers s where s.id = (cur ->> 'speaker_id')::uuid;
  elsif tg_table_name in ('program_ideas','program_metrics') then
    pid := (cur ->> 'program_id')::uuid;
    if tg_table_name = 'program_ideas' then
      lbl := cur ->> 'title';
    else
      select p.title into lbl from programs p where p.id = pid;
    end if;
  elsif tg_table_name = 'suggestions' then
    pid := null; lbl := cur ->> 'title';
  else
    pid := null; lbl := cur ->> 'full_name';
  end if;

  if tg_op = 'INSERT' then
    insert into change_log (table_name, record_id, program_id, label, field, old_value, new_value, changed_by)
    values (tg_table_name, rid, pid, coalesce(lbl,''), 'added', null, coalesce(lbl,''), who);
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into change_log (table_name, record_id, program_id, label, field, old_value, new_value, changed_by)
    values (tg_table_name, rid, pid, coalesce(lbl,''), 'removed', coalesce(lbl,''), null, who);
    return old;
  end if;

  o := to_jsonb(old); n := cur;
  for k in select jsonb_object_keys(n) loop
    if public.is_noise_field(k) then continue; end if;
    if (o -> k) is distinct from (n -> k) then
      insert into change_log (table_name, record_id, program_id, label, field, old_value, new_value, changed_by)
      values (tg_table_name, rid, pid, coalesce(lbl,''), k,
              nullif(o ->> k, ''), nullif(n ->> k, ''), who);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_log_suggestions on suggestions;
create trigger trg_log_suggestions after insert or update or delete on suggestions
  for each row execute function public.log_changes();

-- ---------- 4. seed the plan we actually brainstormed ----------
--  Only when the table is empty, so re-running this never duplicates a
--  row and never fights with real suggestions added since.
--
--  'done' means live on docket.nacba.org. 'planned' means decided but
--  not started. 'new' means raised and not yet decided — it is NOT a
--  commitment, and several of these are NACBA's call, not the
--  committee's.
do $$
begin
  if not exists (select 1 from suggestions) then
    insert into suggestions (title, detail, area, status, submitted_by, decided_note) values

    ('Let speakers write their own biography',
     'Speakers fill in their own bio and headshot from the packet link instead of '
     'emailing a Word attachment that someone then has to retype.',
     'portal', 'done', 'build plan', 'Live.'),

    ('Say who owes each task, not just which role',
     'The docket could say "a Coordinator should do this" but not "Deidre should do this". '
     'Every task now names a person, inherited from the program''s coordinator or moderator, '
     'and any single task can be reassigned by hand without the program''s own choice '
     'overwriting it later.',
     'portal', 'done', 'build plan', 'Live 2026-11-02.'),

    ('Set a whole season''s coordinators at once',
     'An Assignments grid with programs down and roles across, and a set-all control in each '
     'column header for the case where one person covers the whole season.',
     'portal', 'done', 'build plan', 'Live 2026-11-02.'),

    ('Send the invitation from the portal, and log what was sent',
     'The branded invitation is already built and already Outlook-safe — the portal previews it '
     'and copies it, and stops one step short of sending. Sending needs a shared NACBA mailbox '
     'and an app registration limited to that one mailbox. Then every send can be logged, so '
     '"did the speaker ever get this?" has an answer.',
     'portal', 'planned', 'build plan',
     'On the plan, deliberately not in flight (2026-11-02). Needs the two IT requests first.'),

    ('A Today list: what I owe, across every program',
     'One screen per person showing what is due and what is late, instead of opening each '
     'program to find out. Only became possible once tasks named a person.',
     'portal', 'planned', 'build plan', 'Unblocked by task assignment.'),

    ('Filter the team view by person',
     'Deidre''s request. It was impossible while a task belonged to a job title rather than a '
     'person — there was nothing to filter on.',
     'portal', 'planned', 'build plan', 'Unblocked by task assignment.'),

    ('Sign in with a 6-digit code instead of a link',
     'The docket often gets opened on a borrowed computer, where clicking a link in your own '
     'inbox is the awkward part. The code version is written; it needs the token added to the '
     'Supabase sign-in email template before it works.',
     'portal', 'planned', 'build plan', 'Built once and reverted, waiting on the email template.'),

    ('A speakers bureau',
     'A searchable, outward-facing view of who can speak on what, built from the roster the '
     'committee already maintains rather than a second list to keep up to date.',
     'portal', 'considering', 'build plan', ''),

    ('Settle the materials deadline in writing',
     'The Speaker Agreement says 14 days prior and in no event later than 7. Checklist 6.2 says '
     'confirm the final deck at 48 hours. The portal already implements 14 days as the target '
     'and 7 as firm, and reframes the 48-hour item as the QC review — but the written documents '
     'still contradict each other, and the documents are what speakers are sent.',
     'process', 'considering', 'build plan', ''),

    ('The Run of Show template',
     'Checklist 5.1 requires one. It does not exist.',
     'documents', 'new', 'build plan', ''),

    ('The three-page NACBA handout',
     'Checklist 4.1 requires one. It does not exist.',
     'documents', 'new', 'build plan', ''),

    ('The shared NACBA spreadsheet',
     'Checklist 3.2 refers to it. It does not exist. Worth asking whether the portal now covers '
     'what it was meant to do, in which case the reference should come out.',
     'documents', 'new', 'build plan', ''),

    ('NACBA brand guidelines',
     'Section 4.2 requires speakers to comply with NACBA brand colors and fonts. No guidelines '
     'exist to comply with, and the "branded" PowerPoint template carries Microsoft''s stock '
     'Office 2007 theme.',
     'documents', 'new', 'build plan', ''),

    ('Name the states NACBA files CLE in',
     'CLE is the stated reason the materials deadline exists, but it appears nowhere in the '
     'checklist and nobody has said which states we file in. It changes how firm the deadline '
     'has to be.',
     'process', 'new', 'build plan', ''),

    ('Confirm what the Supabase plan gives us for backups',
     'This is the real protection if the database is ever damaged, by anyone or anything. '
     'Nobody has checked which plan the project is on, or whether point-in-time recovery is '
     'included.',
     'process', 'new', 'build plan', '');
  end if;
end $$;


-- ---------- did it work ----------
select 'suggestions table' as check,
       count(*) as columns_present
  from information_schema.columns
 where table_schema = 'public' and table_name = 'suggestions';

select 'the plan, by status' as check,
       count(*) filter (where status = 'done')        as already_live,
       count(*) filter (where status = 'planned')     as decided,
       count(*) filter (where status = 'considering') as considering,
       count(*) filter (where status = 'new')         as raised_not_decided,
       count(*) filter (where status = 'declined')    as declined,
       count(*)                                       as total
  from suggestions;

select 'by area' as check,
       count(*) filter (where area = 'portal')    as portal,
       count(*) filter (where area = 'process')   as process,
       count(*) filter (where area = 'documents') as documents,
       count(*) filter (where area = 'other')     as other
  from suggestions;

select 'the change log knows this table' as check,
       count(*) as should_be_one
  from pg_trigger
 where tgname = 'trg_log_suggestions' and not tgisinternal;

-- A suggestion logged with a blank label means the log_changes branch
-- above did not take effect. This should show the titles, not blanks.
select 'labels in the log' as check, label, field
  from change_log
 where table_name = 'suggestions'
 order by changed_at desc
 limit 5;
