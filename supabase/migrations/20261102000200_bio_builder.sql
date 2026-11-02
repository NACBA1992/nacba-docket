-- ============================================================
--  NACBA Speaker Docket — speakers write their own bio
--  Safe to re-run.
--
--  Deidre Durant, 25 Oct 2026: "How can we shift the onus of providing
--  bios, headshots, and session details back to the speakers? Currently
--  I am spending a significant amount of time manually pulling this
--  information from their firm websites and LinkedIn profiles."
--
--  Two things were missing, and they are different problems.
--
--  1. There was nowhere to PUT a bio. `speakers.bio_location` is a
--     pointer to where a file sits, not the text. So even a bio a
--     speaker had sent could not be read, reused, or pasted into a
--     promotion. This adds the text itself, in two lengths, because the
--     long one goes in the programme and the short one gets read aloud.
--
--  2. Headshots were stored against `program_speakers` — a booking —
--     not against the person. A photo sent for one webinar did not
--     follow the speaker to the next, which is exactly why a recurring
--     speaker had to be chased again. This adds a headshot to the
--     speaker record, so it is sent once and kept.
--
--  Nothing here replaces an existing function. speaker_upload and
--  speaker_packet are long and still correct; these are new, additive
--  RPCs alongside them, so there is no chance of a bad transcription
--  silently dropping a working one.
-- ============================================================

-- ---------- the bio itself ----------
alter table speakers add column if not exists bio            text not null default '';
alter table speakers add column if not exists bio_short      text not null default '';
alter table speakers add column if not exists linkedin       text not null default '';
alter table speakers add column if not exists bio_updated_at timestamptz;
alter table speakers add column if not exists bio_updated_by text not null default '';

comment on column speakers.bio is
  'The full biography, as the speaker wrote it. Plain text. This is the '
  'source of truth -- bio_location points at a file someone sent, which '
  'may be older.';
comment on column speakers.bio_short is
  'One or two sentences, for the moderator to read on air and for '
  'promotion. Speakers are asked to keep it under about 60 words.';
comment on column speakers.bio_updated_by is
  'speaker = they wrote it themselves | staff = someone at NACBA typed '
  'it in. Lets staff see at a glance which bios are still second-hand.';

-- ---------- a headshot that belongs to the person ----------
alter table speakers add column if not exists headshot      bytea;
alter table speakers add column if not exists headshot_mime text not null default '';
alter table speakers add column if not exists headshot_at   timestamptz;

comment on column speakers.headshot is
  'The speaker''s current headshot, held against the person rather than '
  'one booking, so a returning speaker is never asked twice. Bytes are '
  'never included in a list query -- read them through speaker_headshot().';

-- ------------------------------------------------------------
--  Speaker side. The token is the whole authorisation, exactly as in
--  speaker_update_details: anonymous visitors have no policy on any
--  table, so these functions are their entire reach.
-- ------------------------------------------------------------

-- Resolve a packet token to a speaker id, or null.
create or replace function public.speaker_from_token(tok text)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  link speaker_links%rowtype;
  sid  uuid;
begin
  if tok is null or length(tok) < 16 then
    return null;
  end if;
  select * into link from speaker_links where token = tok and revoked = false;
  if not found then
    return null;
  end if;
  select ps.speaker_id into sid
    from program_speakers ps where ps.id = link.program_speaker_id;
  return sid;
end $$;

revoke all on function public.speaker_from_token(text) from public;

-- ---------- read the bio back, to prefill the form ----------
create or replace function public.speaker_bio(tok text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  sid uuid := public.speaker_from_token(tok);
  s   speakers%rowtype;
begin
  if sid is null then
    return jsonb_build_object('ok', false, 'error', 'This link is no longer active.');
  end if;
  select * into s from speakers where id = sid;
  return jsonb_build_object(
    'ok',             true,
    'full_name',      s.full_name,
    'firm',           s.firm,
    'title',          s.preferred_title,
    'bio',            s.bio,
    'bio_short',      s.bio_short,
    'linkedin',       s.linkedin,
    'bio_updated_at', s.bio_updated_at,
    'bio_updated_by', s.bio_updated_by,
    'has_headshot',   s.headshot is not null,
    'headshot_at',    s.headshot_at
  );
end $$;

revoke all on function public.speaker_bio(text) from public;
grant execute on function public.speaker_bio(text) to anon, authenticated;

-- ---------- write it ----------
create or replace function public.speaker_save_bio(
  tok         text,
  p_bio       text,
  p_bio_short text,
  p_linkedin  text
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  sid uuid := public.speaker_from_token(tok);
begin
  if sid is null then
    return jsonb_build_object('ok', false, 'error', 'This link is no longer active.');
  end if;

  -- A generous ceiling, not a style rule. Long enough for any real bio,
  -- short enough that a paste accident cannot fill the table.
  if length(coalesce(p_bio, '')) > 20000 or length(coalesce(p_bio_short, '')) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'That is longer than we can store.');
  end if;

  update speakers
     set bio            = coalesce(p_bio, ''),
         bio_short      = coalesce(p_bio_short, ''),
         linkedin       = coalesce(p_linkedin, ''),
         bio_updated_at = now(),
         bio_updated_by = 'speaker'
   where id = sid;

  return jsonb_build_object('ok', true, 'saved_at', now());
end $$;

revoke all on function public.speaker_save_bio(text,text,text,text) from public;
grant execute on function public.speaker_save_bio(text,text,text,text) to anon, authenticated;

-- ---------- the headshot, stored once against the person ----------
create or replace function public.speaker_save_headshot(
  tok    text,
  p_mime text,
  p_b64  text
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  sid   uuid := public.speaker_from_token(tok);
  bytes bytea;
begin
  if sid is null then
    return jsonb_build_object('ok', false, 'error', 'This link is no longer active.');
  end if;

  if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false,
      'error', 'Please send a JPEG, PNG, or WebP image.');
  end if;

  begin
    bytes := decode(p_b64, 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'That file did not arrive intact.');
  end;

  if octet_length(bytes) > 10485760 then
    return jsonb_build_object('ok', false, 'error', 'Please keep the image under 10 MB.');
  end if;
  if octet_length(bytes) = 0 then
    return jsonb_build_object('ok', false, 'error', 'That file was empty.');
  end if;

  update speakers
     set headshot      = bytes,
         headshot_mime = p_mime,
         headshot_at   = now()
   where id = sid;

  return jsonb_build_object('ok', true, 'bytes', octet_length(bytes), 'saved_at', now());
end $$;

revoke all on function public.speaker_save_headshot(text,text,text) from public;
grant execute on function public.speaker_save_headshot(text,text,text) to anon, authenticated;

-- ------------------------------------------------------------
--  Staff side. Signed in and on the allowlist.
-- ------------------------------------------------------------

-- Bytes on demand, one speaker at a time. Never in a list query.
create or replace function public.speaker_headshot(sid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare s speakers%rowtype;
begin
  if not public.is_allowed() then
    return jsonb_build_object('ok', false, 'error', 'Not permitted.');
  end if;
  select * into s from speakers where id = sid;
  if not found or s.headshot is null then
    return jsonb_build_object('ok', false, 'error', 'No headshot on file.');
  end if;
  return jsonb_build_object(
    'ok',   true,
    'mime', s.headshot_mime,
    'b64',  encode(s.headshot, 'base64'),
    'at',   s.headshot_at
  );
end $$;

revoke all on function public.speaker_headshot(uuid) from public;
grant execute on function public.speaker_headshot(uuid) to authenticated;

-- Staff can also type a bio in, for a speaker who will not.
create or replace function public.staff_save_bio(
  sid         uuid,
  p_bio       text,
  p_bio_short text,
  p_linkedin  text
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if not public.is_allowed() then
    return jsonb_build_object('ok', false, 'error', 'Not permitted.');
  end if;
  if length(coalesce(p_bio, '')) > 20000 or length(coalesce(p_bio_short, '')) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'That is longer than we can store.');
  end if;
  update speakers
     set bio            = coalesce(p_bio, ''),
         bio_short      = coalesce(p_bio_short, ''),
         linkedin       = coalesce(p_linkedin, ''),
         bio_updated_at = now(),
         bio_updated_by = 'staff'
   where id = sid;
  return jsonb_build_object('ok', true, 'saved_at', now());
end $$;

revoke all on function public.staff_save_bio(uuid,text,text,text) from public;
grant execute on function public.staff_save_bio(uuid,text,text,text) to authenticated;

-- ---------- who still has no bio of their own ----------
select
  count(*)                                                   as speakers,
  count(*) filter (where bio <> '')                          as have_a_bio,
  count(*) filter (where bio_updated_by = 'speaker')         as written_by_them,
  count(*) filter (where headshot is not null)               as have_a_headshot
from speakers;
