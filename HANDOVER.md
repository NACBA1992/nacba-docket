# Handing this over to NACBA

Two things move independently: the **website** (a public GitHub repository
published through GitHub Pages) and the **database** (a Supabase project).
They are joined only by two constants at the top of each HTML file.

Read the order-of-operations warning before starting. One sequence breaks
every speaker link that has already been sent; the other does not.

---

## Before anything moves

**1. Give NACBA an administrator.** In the app: Team → add their email with
Administrator access. Until someone at NACBA is an admin, only Tara can
manage who has access, and the last-admin guard will refuse to remove her.

**2. Decide who owns what.** NACBA needs a GitHub account or organization,
and a Supabase account. Both are free at this size.

**3. Hand over what is not in the repository.**

- `supabase/seed.sql` — the 2026 season. Git-ignored on purpose: it holds
  speaker contact details including federal court and Department of Justice
  addresses, and the repository is public.
- `Speaker Packet 2026/` — the seven Word and PowerPoint templates, plus
  `build.js`, which regenerates them.

---

> **Status: done.** Both halves moved to NACBA in October 2026. The repo is
> `NACBA1992/nacba-docket`; the Supabase project was transferred intact, keeping
> ref `lnollnddtavdhigkkefy` and its keys. The custom domain `docket.nacba.org`
> was set up first, exactly as advised below, so the site address never changed
> and previously emailed speaker links kept working.
>
> The rest of this guide is kept for reference — it is the procedure to follow if
> any of this ever moves again.

## The order matters

**Move the database first, the website second — or better, set up a custom
domain before moving the website at all.**

Transferring the Supabase project keeps its URL and keys, so nothing in the
code changes and nothing breaks.

Transferring the GitHub repository **changes the site address** from
`salinaslawgroup.github.io/nacba-docket` to whatever NACBA's account is. That
address is baked into every speaker packet link already emailed. Those links
stop working, and every speaker has to be sent a new one.

A custom domain — `docket.nacba.org`, say — makes the address permanent
regardless of who owns the repository. If NACBA intends to keep this, set
that up first and the problem never arises.

---

## Moving the database

**Preferred: transfer the project.** Supabase can move a project between
organizations. Both parties need to be members of the source and destination
organizations at the time, and the destination has to have room on its plan.
In the dashboard: Project Settings → General → Transfer project.

The project keeps its reference, URL and keys, so **no code changes and no
downtime**. Verify it afterwards with `supabase projects list`.

**Fallback: rebuild it.** If transfer is unavailable, the migrations are the
schema and the rebuild is mechanical:

    supabase login
    supabase link --project-ref <NACBA's new project ref>
    supabase db push          # applies all 24 migrations

Then move the data. The Supabase Table Editor exports any table as CSV and
imports one back; do the tables in this order so foreign keys resolve:

    categories, speakers, programs, program_speakers, deliverables,
    tasks, program_categories, speaker_categories, speaker_links,
    speaker_uploads, program_ideas, idea_categories, program_metrics,
    run_sheet_items, allowed_emails, change_log

Finally, change the two constants at the top of `index.html`,
`speaker.html` and `agreement.html`:

    const SUPABASE_URL = "https://<new-ref>.supabase.co";
    const SUPABASE_KEY = "sb_publishable_...";

The publishable key is safe in public source. Access is controlled by
row-level security and the `allowed_emails` list, not by hiding the key.

---

## Moving the website

GitHub: Settings → General → Danger Zone → Transfer ownership. It is free,
keeps the full history, and leaves redirects behind for the repository —
but **not** for the Pages address.

After transferring:

1. Re-enable Pages: Settings → Pages → Deploy from branch → `main` / root.
2. Add the new site address to Supabase → Authentication → URL
   Configuration → Redirect URLs. Sign-in links fail silently without it.
3. Re-issue speaker packet links for anyone whose program has not yet run.
   Old links point at the old address.

---

## After the move, check these

- Sign in at the new address with an allowlisted email.
- `supabase migration list` shows all migrations applied.
- Open a program: the docket, categories and statistics are present.
- Open Speakers: the roster and each speaker's program history.
- Preview a packet, then check the speaker's "opened" count did **not**
  increase — staff previews are meant not to count.
- Run the test suite: `node test/smoke.js`, and the other five in `test/`.

---

## What stays behind

Nothing of NACBA's. The Supabase project used here was created solely for
this system and holds no other data.

It is deliberately **not** the same project as Salinas Law Group's practice
database, which is why a transfer is possible at all — a project transfer
moves everything in it, and mixing the two would have made this handover
impossible without extracting tables first.
