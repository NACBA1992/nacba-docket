-- ============================================================
--  NACBA Webinar Docket — keep file bytes out of the change log
--  Safe to re-run. Paste into the dashboard SQL editor and Run.
--
--  WHAT IS WRONG
--  log_changes() loops over every changed column and writes the old and
--  new values into change_log as text, skipping only the names listed in
--  is_noise_field(). Two columns on speakers are bytea:
--
--      speakers.headshot     added 20261102000200_bio_builder  (<= 10 MB)
--      speakers.name_audio   added 20260815000500_name_audio
--
--  Neither is listed, so every headshot upload and every name recording
--  writes that file into change_log twice over -- once as new_value, and
--  on a replacement once more as old_value -- rendered as hex, which is
--  roughly two characters per byte. A single 10 MB headshot can leave
--  about 20 MB of text in one row.
--
--  It is not only wasted storage. loadHistory() in index.html reads
--
--      select id, table_name, ..., old_value, new_value ... limit 40
--
--  so those rows are pulled into the browser on every page that shows the
--  change history. trunc() shortens them for display, but only after the
--  whole thing has crossed the wire.
--
--  THE FIX
--  Add both columns to is_noise_field() so the bytes are never logged,
--  and blank the payload out of the rows already written. Nothing is
--  lost from the audit trail: headshot_at, headshot_mime, name_audio_at
--  and name_audio_mime are ordinary small columns, they are not noise,
--  and they are already logged -- so "a headshot arrived on 12 Nov" is
--  still recorded, in a readable form and a few bytes.
--
--  The rows themselves are kept rather than deleted. An audit log should
--  not lose entries; it is the payload that had no business being there.
-- ============================================================

-- ---------- 1. stop logging the bytes ----------
create or replace function public.is_noise_field(f text)
returns boolean language sql immutable as $$
  select f in ('id','created_at','updated_at','sort_order','slug',
               -- bytea columns: the companion _at and _mime columns carry
               -- the readable record, and these carry up to 10 MB of hex
               'headshot','name_audio');
$$;

-- Written as one literal rather than adjacent strings: Postgres concatenates
-- those happily, but sqlglot cannot parse them, and this script is pre-flighted
-- with sqlglot before it is pasted into the editor.
comment on function public.is_noise_field(text) is 'Columns log_changes() will not write to change_log: housekeeping keys, and the bytea file columns on speakers, whose bytes would otherwise be stored as hex and then read back by loadHistory() on every page view.';

-- ---------- 2. blank what has already been written ----------
--  Matched on size as well as name so that a short, legitimate value is
--  left alone, and so re-running this does nothing the second time.
update change_log
   set old_value = case when old_value is null then null
                        else '(file bytes, no longer kept in the log)' end,
       new_value = case when new_value is null then null
                        else '(file bytes, no longer kept in the log)' end
 where table_name = 'speakers'
   and field in ('headshot','name_audio')
   and (coalesce(length(old_value),0) > 200 or coalesce(length(new_value),0) > 200);

-- ---------- 3. verification ----------
--  The SQL editor does not display RAISE NOTICE, so every check is a
--  SELECT. Read them in the results pane after running.

-- Both columns must now be noise, and the old entries must still be there.
select 'headshot is noise'    as check, public.is_noise_field('headshot')   as pass
union all
select 'name_audio is noise',        public.is_noise_field('name_audio')
union all
select 'headshot_at still logged',   not public.is_noise_field('headshot_at')
union all
select 'name_audio_at still logged', not public.is_noise_field('name_audio_at')
union all
select 'bio still logged',           not public.is_noise_field('bio')
union all
select 'id still noise',             public.is_noise_field('id');

-- Nothing oversized should be left in the log.
select count(*) as rows_still_oversized
  from change_log
 where coalesce(length(old_value),0) > 200
    or coalesce(length(new_value),0) > 200;

-- What the log now costs, and the largest thing left in it.
select pg_size_pretty(pg_total_relation_size('change_log')) as change_log_size,
       count(*)                                             as rows,
       max(greatest(coalesce(length(old_value),0),
                    coalesce(length(new_value),0)))         as longest_value
  from change_log;

-- The headshots themselves are untouched; this only ever read the log.
select count(*)                                   as speakers,
       count(headshot)                            as have_a_headshot,
       pg_size_pretty(sum(octet_length(headshot))) as headshot_bytes
  from speakers;
