-- ============================================================
--  NACBA Webinar Docket — a headshot must actually be an image
--  Safe to re-run. Paste into the dashboard SQL editor and Run.
--
--  WHAT IS WRONG
--  speaker_save_headshot() decides what a file is by believing the
--  browser:
--
--      if p_mime not in ('image/jpeg','image/png','image/webp') ...
--
--  p_mime comes from the client. Safari reports some iPhone photos as
--  image/jpeg even though they are HEIC, so an HEIC passes that check,
--  is stored, and is recorded as a JPEG. It then downloads as a .jpg
--  that most design tools refuse to open, and nothing anywhere says
--  why. A truncated upload passes the same check for the same reason:
--  nothing ever looks at the bytes.
--
--  THE FIX
--  Read the first and last bytes and decide from those. The mime that
--  gets stored is the one the file proves, not the one it claims, and
--  the browser's p_mime is now only a hint for the error message.
--
--  Checking the trailer as well as the header is what catches an upload
--  that was cut off: JPEG ends FF D9, PNG ends with its IEND chunk.
--  Both are cheap and exact, and refusing at the door means the speaker
--  finds out while they still have the file, rather than a coordinator
--  finding out weeks later with a promo graphic to build.
--
--  The packet converts HEIC to JPEG in the browser before sending, so
--  in normal use this never fires. It is here so that the database is
--  true regardless of what any future client does.
-- ============================================================

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
  n     int;
  mime  text;
begin
  if sid is null then
    return jsonb_build_object('ok', false, 'error', 'This link is no longer active.');
  end if;

  begin
    bytes := decode(p_b64, 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'That file did not arrive intact.');
  end;

  n := octet_length(bytes);

  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'That file was empty.');
  end if;
  if n > 10485760 then
    return jsonb_build_object('ok', false, 'error', 'Please keep the image under 10 MB.');
  end if;

  -- Decide from the bytes. Header identifies; trailer proves it is whole.
  if substring(bytes from 1 for 3) = '\xffd8ff'::bytea then
    if substring(bytes from n - 1 for 2) <> '\xffd9'::bytea then
      return jsonb_build_object('ok', false,
        'error', 'That JPEG did not finish uploading. Please try sending it again.');
    end if;
    mime := 'image/jpeg';

  elsif substring(bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea then
    if substring(bytes from n - 7 for 8) <> '\x49454e44ae426082'::bytea then
      return jsonb_build_object('ok', false,
        'error', 'That PNG did not finish uploading. Please try sending it again.');
    end if;
    mime := 'image/png';

  elsif substring(bytes from 1 for 4) = '\x52494646'::bytea
    and substring(bytes from 9 for 4) = '\x57454250'::bytea then
    mime := 'image/webp';

  elsif substring(bytes from 5 for 4) = '\x66747970'::bytea then
    -- ISO base media: HEIC, HEIF, AVIF. Readable on an Apple device and
    -- almost nowhere else, which is exactly why it must not be stored.
    return jsonb_build_object('ok', false,
      'error', 'That looks like an iPhone photo (HEIC), which most design software '
            || 'cannot open. Please export it as a JPEG and send that.');

  elsif substring(bytes from 1 for 4) = '\x25504446'::bytea then
    return jsonb_build_object('ok', false,
      'error', 'That is a PDF, not a photograph. Please send the image itself.');

  else
    return jsonb_build_object('ok', false,
      'error', 'That file does not look like a JPEG, PNG or WebP image.');
  end if;

  update speakers
     set headshot      = bytes,
         headshot_mime = mime,
         headshot_at   = now()
   where id = sid;

  return jsonb_build_object('ok', true, 'bytes', n, 'mime', mime, 'saved_at', now());
end $$;

revoke all on function public.speaker_save_headshot(text,text,text) from public;
grant execute on function public.speaker_save_headshot(text,text,text) to anon, authenticated;

comment on function public.speaker_save_headshot(text,text,text) is 'Stores a speaker headshot. The format is read from the file bytes, never from the mime type the browser supplies, because Safari reports some HEIC photos as image/jpeg. Also rejects a JPEG or PNG whose trailer is missing, which is what an interrupted upload looks like.';

-- ---------- verification ----------
--  The SQL editor does not display RAISE NOTICE, so every check is a SELECT.

-- What is already stored, judged by the same rules. Anything not 'ok' here
-- is a row that got in before this migration and needs resending.
select s.full_name,
       s.headshot_mime                                   as recorded_as,
       pg_size_pretty(octet_length(s.headshot)::bigint)   as size,
       case
         when substring(s.headshot from 1 for 3) = '\xffd8ff'::bytea
           then case when substring(s.headshot from octet_length(s.headshot) - 1 for 2) = '\xffd9'::bytea
                     then 'ok - jpeg' else 'TRUNCATED jpeg' end
         when substring(s.headshot from 1 for 8) = '\x89504e470d0a1a0a'::bytea
           then case when substring(s.headshot from octet_length(s.headshot) - 7 for 8) = '\x49454e44ae426082'::bytea
                     then 'ok - png' else 'TRUNCATED png' end
         when substring(s.headshot from 1 for 4) = '\x52494646'::bytea then 'ok - webp'
         when substring(s.headshot from 5 for 4) = '\x66747970'::bytea then 'HEIC - needs resending'
         else 'UNKNOWN - needs resending'
       end                                               as actually_is
  from speakers s
 where s.headshot is not null
 order by s.full_name;

-- The guard itself is in place.
select 'validates bytes, not the claimed mime' as check,
       pg_get_functiondef('public.speaker_save_headshot(text,text,text)'::regprocedure)
         like '%66747970%' as pass;
