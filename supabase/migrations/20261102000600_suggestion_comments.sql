-- ============================================================
--  NACBA Webinar Docket — comments on suggestions
--  Run in the SQL editor of the NACBA Supabase project. Safe to re-run.
--
--  WHY A TABLE AND NOT A COLUMN
--  decided_note on suggestions answers "where does this stand", in one
--  voice: the committee's. A comment is the opposite — many people, in
--  their own words, in order, and each one has an author who may want
--  to take it back. That is rows, not a growing text field that two
--  people editing at once would overwrite for each other.
--
--  WHY log_changes() IS NOT ATTACHED HERE
--  Every other table that people edit gets trg_log_* so the change log
--  can say who changed what. A comment is different: the row IS the
--  record of who said what and when, so logging it would write every
--  comment down twice and bury the field edits the log exists for.
--  Deliberate — do not "fix" it by adding a branch to log_changes().
-- ============================================================

-- ---------- 1. the table ----------
create table if not exists suggestion_comments (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions (id) on delete cascade,
  body          text not null check (btrim(body) <> ''),
  author        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table suggestion_comments is
  'Discussion on a single suggestion. Deliberately not watched by '
  'log_changes(): the row is already a record of who said what and when.';
comment on column suggestion_comments.author is
  'Set from the signed-in email by trigger, never trusted from the client, '
  'so a comment cannot be posted under somebody else''s name.';

-- Reading a thread is always "this suggestion, oldest first".
create index if not exists suggestion_comments_thread_idx
  on suggestion_comments (suggestion_id, created_at);

alter table suggestion_comments enable row level security;

-- ---------- 2. who may do what ----------
--  Everyone on the allow-list reads the whole discussion and may add to
--  it. Editing and deleting are limited to the person who wrote it:
--  a committee member should not be able to reword a colleague's
--  feedback, and that is worth four policies instead of one.
drop policy if exists suggestion_comments_read   on suggestion_comments;
drop policy if exists suggestion_comments_write  on suggestion_comments;
drop policy if exists suggestion_comments_insert on suggestion_comments;
drop policy if exists suggestion_comments_update on suggestion_comments;
drop policy if exists suggestion_comments_delete on suggestion_comments;

create policy suggestion_comments_read on suggestion_comments
  for select to authenticated using (public.is_allowed());

create policy suggestion_comments_insert on suggestion_comments
  for insert to authenticated with check (public.is_allowed());

create policy suggestion_comments_update on suggestion_comments
  for update to authenticated
  using (public.is_allowed()
         and lower(author) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.is_allowed()
         and lower(author) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy suggestion_comments_delete on suggestion_comments
  for delete to authenticated
  using (public.is_allowed()
         and lower(author) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------- 3. stamp the author, not the client ----------
--  The insert policy cannot set a column, so the author comes from the
--  JWT in a trigger. An insert that tries to name someone else is
--  overwritten rather than rejected: the comment still lands, under the
--  name of whoever is actually signed in.
create or replace function public.stamp_suggestion_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  else
    new.author := old.author;          -- an edit never changes who said it
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_stamp_suggestion_comment on suggestion_comments;
create trigger trg_stamp_suggestion_comment
  before insert or update on suggestion_comments
  for each row execute function public.stamp_suggestion_comment();


-- ---------- did it work ----------
select 'the table' as check,
       count(*) as columns_present
  from information_schema.columns
 where table_schema = 'public' and table_name = 'suggestion_comments';

select 'the four policies' as check,
       count(*) as should_be_four
  from pg_policies
 where schemaname = 'public' and tablename = 'suggestion_comments';

select 'the author trigger' as check,
       count(*) as should_be_one
  from pg_trigger
 where tgname = 'trg_stamp_suggestion_comment' and not tgisinternal;

-- Deliberately empty: nothing seeds a conversation. Should be 0 rows the
-- first time and your real comments after that.
select 'comments so far' as check, count(*) as rows_present
  from suggestion_comments;

-- The log is NOT meant to carry this table. This should come back 0; if
-- it ever shows rows, a later migration attached log_changes() by mistake.
select 'left out of the change log, on purpose' as check,
       count(*) as should_be_zero
  from change_log
 where table_name = 'suggestion_comments';
