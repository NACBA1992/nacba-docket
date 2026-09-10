# NACBA Webinar Docket

A shared tracker for NACBA Education Committee webinar operations. Enter a webinar
date and the system generates every deadline that hangs off it — registration open,
speaker package, materials, run of show, follow-up — with an owner on each one.

Built for the 2026 season: 11 programs, 19 speakers.

## What's in this repository

This repo holds **only the application shell**. No speaker names, no email addresses,
no NACBA data of any kind. Everything is stored in Supabase behind an email sign-in.
That split is deliberate: GitHub Pages serves public sites on the free plan, and the
speaker roster includes federal court and Department of Justice addresses that must
not be publicly readable.

```
index.html              the staff app — no build step, nothing to install
speaker.html            the speaker packet page
supabase/migrations/    the database, in order
templates/              the six speaker packet documents
```

`supabase/seed.sql` — the 2026 season — is **git-ignored on purpose**. It carries
speaker contact details, including federal court and Department of Justice
addresses, so it is applied directly and kept outside this repository.

The Supabase publishable key in `index.html` is safe in public source. It is designed
to ship in browser code; access is controlled by row-level security, not by hiding
the key.

## Setup

**1. Apply the database.** With the Supabase CLI linked (see below):

```
supabase db push
```

Every migration is idempotent, so pushing against a database that already has them
is safe. Seed data is applied separately — `supabase/seed.sql` is not a migration,
because it holds speaker contact details and must stay out of this repository.

Seed *before* the change-history migration if you are building a database from
scratch, or the initial import arrives as two hundred log entries.

**2. Add the people who need access.** Nobody sees a single row unless their email is
in `allowed_emails`:

```sql
insert into allowed_emails (email, role, full_name) values
  ('someone@nacba.com', 'coordinator', 'Name Here')
on conflict (email) do update set role = excluded.role;
```

Roles: `admin`, `coordinator`, `moderator`, `marketing`, `emc_chair`, `staff`.
Only `admin` can change the list. Removing someone is a `delete` — they can still
sign in, but see nothing.

**3. Allow the site to receive sign-in links.** In Supabase → Authentication → URL
Configuration, add the published site URL to **Redirect URLs**. Sign-in links fail
silently without this.

**4. Optional but recommended.** In Authentication → Providers → Email, turn off
"Enable sign-ups" once everyone is added. Strangers can otherwise request a link
and create an account — they will see nothing, but there is no reason to allow it.

## How the docket works

`docket_template` holds the 16 canonical deadlines, each as an offset from the event
date. Inserting a program fires a trigger that generates its tasks; adding a speaker
generates their five package items. Adding the 2027 season is one insert per program.

Editing a row in `docket_template` changes the rule for **future** programs only.
Existing tasks are left alone, so a mid-season policy change cannot silently rewrite
history.

The three conflicting materials deadlines in the source documents are resolved here:
materials are **due at T−14**, **overdue at T−7** (the CLE filing cutoff), and the
48-hour item from §6.2 is *QC review complete* — not receipt of materials.

## Deploying

Any static host works; the app is one file. For GitHub Pages: Settings → Pages →
Deploy from branch → `main` / root.

## Moving this to NACBA

Both halves transfer independently.

**The repo:** Settings → Transfer ownership. Free, keeps history, leaves redirects.

**The database:** Supabase can transfer a project between organizations, but don't
depend on it. The durable path is: create a project in NACBA's account, run
`01_schema.sql`, export the tables as CSV from the old project and import them, then
change the two constants at the top of `index.html`. About twenty minutes, and it
works regardless of plan or org membership.

Keeping this in its own Supabase project — never alongside other data — is what makes
that possible.

## Editing

Everything that changes week to week is editable in the app: a program's title,
description, date and note; speakers on a program and their confirmation status;
and the persistent speaker record (firm, email, phone, name pronunciation, and
where the headshot and bio are filed).

**Moving a date is safe.** Tasks store *offsets*, not dates. Due dates are computed
from the program's event date, so changing it shifts the whole docket and every
completed checkbox stays completed.

**Creating a program generates its docket.** Add one with a date and title and its
16 deadlines appear with it. Adding a speaker generates their five package items.

**Every content edit is logged** — which field, old value, new value, who, when —
and shown per program and account-wide. The log is append-only: no policy grants
insert, update, or delete, so it cannot be edited from the app at all. Task
checkboxes and package items are not logged; they already carry their own stamps,
and logging them would bury real edits under routine ticking.

Deleting a speaker from a program removes their package items but leaves the roster
record intact, so their bio and pronunciation survive for the next booking.

## Speaker packet pages

Speakers are not staff and are never on the allowlist, so they cannot sign in.
Each speaker instead gets an unguessable link to `speaker.html?k=<token>` showing
their own program: what is due, on which calendar dates, what NACBA has already
received, and a download for every template.

The link grants **no table access**. Anonymous visitors have no RLS policy on any
table and can read nothing at all. Their entire surface is one security-definer
function, `speaker_packet(token)`, which returns that one speaker's row and records
the visit. Co-speakers appear by name only — never their contact details — and the
internal note and staff docket are not exposed.

Staff create and copy a link from the speaker's row on the program page, and see
whether it has been opened and how often. Setting `revoked = true` on a row in
`speaker_links` kills that link immediately.

`templates/` holds the six packet documents. They are blank templates containing no
speaker data, which is why they can live in a public repository.

## Uploads

Speakers send materials from their packet page. Files are held in Postgres
(`speaker_uploads.data`), not Supabase Storage, and every write goes through the
same token check as everything else a speaker can reach.

Storage was the obvious choice and was rejected: it would need either an anonymous
write policy on the bucket — which the publishable key makes world-writable — or an
Edge Function to mint signed upload URLs, which needs deploy access this project
does not have. A 10 MB per-file cap keeps the database well inside the free tier.
If volume ever justifies it, the table is the migration source.

Uploading does **not** mark a deliverable received. The speaker's page shows "you
sent this"; staff tick the box after reviewing. Those are different facts and the
system keeps them apart.

Staff see arrivals under "Sent in by speakers" on the program page and download one
file at a time via `upload_bytes(id)`. List queries never carry the bytes.

## Working with the database

The app deploys itself — pushing to `main` rebuilds the GitHub Pages site. The
database does not. Migrations are a description of the schema; they change nothing
until they are applied.

**One-time setup**

```
supabase login
supabase link --project-ref lnollnddtavdhigkkefy
```

`link` asks for the database password, found under Project Settings → Database.
Neither command should be run by anyone but the project owner.

**Applying changes**

```
supabase db push          # apply anything not yet applied
supabase migration list   # compare local migrations against the remote
```

**Adding a change**

```
supabase migration new whatever_it_does
```

Write idempotent SQL — `create table if not exists`, `create or replace function`,
`drop policy if exists` before `create policy`. Every migration here follows that
rule, so re-running one is never destructive.

**Never point this at the firm's Supabase project.** The NACBA database is
deliberately a separate project so that no automated process, and no session of
Claude, can reach client files.
