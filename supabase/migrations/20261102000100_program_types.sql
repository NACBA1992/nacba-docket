-- ============================================================
--  NACBA Speaker Docket — the program types NACBA actually runs
--  Safe to re-run.
--
--  Requested by Rachael Hodgen, 26 Oct 2026. The original six kinds
--  were a guess made before anyone had used the docket; these are the
--  eleven NACBA programs itself. Three changes worth knowing about:
--
--  1. Nothing is removed. 'conference' and 'workshop' stay permitted
--     because NACBA has been entering programs through the UI since
--     October and this migration will not reject a row someone has
--     already saved. They are retired in the app, not here: the
--     dropdown offers them only to a program already set to one.
--
--  2. The existing ids are reused wherever a new type means the same
--     thing, so no row is rewritten and no history is disturbed:
--       paid             -> Webinar – CLE
--       vendor           -> Sponsored Webinar / Vendor Program
--       marketing_minute -> BK Marketing Minute
--       bk_talk          -> BK Talk
--     'vendor' in particular must keep its id: agreement.html branches
--     on it to swap the neutrality terms for the vendor terms.
--
--  3. 'paid' stays the default. It is the commonest program and the
--     app treats the default as the one type not worth labelling.
-- ============================================================

do $$
begin
  alter table programs drop constraint if exists programs_kind_check;
  alter table programs add constraint programs_kind_check
    check (kind in (
      -- current
      'paid',                    -- Webinar – CLE
      'webinar_nocle',           -- Webinar – Non-CLE
      'vendor',                  -- Sponsored Webinar / Vendor Program
      'marketing_minute',        -- BK Marketing Minute
      'bk_talk',                 -- BK Talk
      'convention_breakout',     -- Annual Convention – Breakout Session
      'convention_plenary',      -- Annual Convention – Plenary Session
      'workshop_members',        -- Members-Only Workshop – Session
      'workshop_virtual',        -- Virtual Workshop – Session
      'workshop_preconvention',  -- Pre-Convention Workshop
      'board_event',             -- Board Meeting / Special Event
      -- retired, still permitted so existing rows stay valid
      'conference',
      'workshop'
    ));
end $$;

comment on column programs.kind is
  'What kind of program this is. paid = Webinar – CLE (the default) | '
  'webinar_nocle = Webinar – Non-CLE | vendor = Sponsored Webinar / Vendor '
  'Program: sponsor pays, free to members, no CLE, and the speaker agreement '
  'swaps in the vendor terms | marketing_minute, bk_talk = quarterly free '
  'member benefit | convention_breakout, convention_plenary = Annual '
  'Convention | workshop_members, workshop_virtual, workshop_preconvention = '
  'workshops, of which only workshop_virtual is online | board_event = Board '
  'Meeting / Special Event. conference and workshop are retired: permitted so '
  'old rows stay valid, but not offered for new programs.';

-- ---------- what is in use right now ----------
-- A SELECT, not RAISE NOTICE: the Supabase SQL editor does not surface
-- notices, so a notice-only report looks identical to nothing happening.
-- Returning rows also proves to whoever ran this that it took effect.
select
  p.kind                                            as program_type,
  count(*)                                          as programs,
  case when p.kind in ('conference','workshop')
       then 'retired - please re-type these'
       else 'current' end                           as status
from programs p
group by p.kind
order by count(*) desc;

-- ---------- proof the constraint is the new one ----------
select
  pg_get_constraintdef(oid) like '%board_event%'         as has_new_types,
  pg_get_constraintdef(oid) like '%webinar_nocle%'       as has_non_cle,
  pg_get_constraintdef(oid) like '%workshop_virtual%'    as has_virtual_workshop,
  pg_get_constraintdef(oid) like '%convention_plenary%'  as has_plenary,
  pg_get_constraintdef(oid)                              as full_definition
from pg_constraint
where conname = 'programs_kind_check'
  and conrelid = 'programs'::regclass;
