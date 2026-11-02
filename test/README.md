# Smoke test

    node test/smoke.js

Renders the staff app against stub data and **fires the click handlers**.

It exists because of two bugs that shipped on 14 Aug 2026:

- `loadHistory` was deleted by an unrelated edit. Every program card went
  dead, because the function is only reached from a click.
- The **Preview email** button's handler was added but its markup was not.

Both passed a review of the source and a test of `render()`. Neither could
have survived a test that clicked something and asserted on the rendered
output. Check the result, not the edit.

    node test/team.js

Checks the Team screen renders the right controls for an administrator, hides
them from everyone else, and protects the last remaining administrator.

    node test/roster.js

Covers the speaker roster, filtering, a speaker's program history, the
catalogue tab, and the in-person and archive fields on the program form.

    node test/ideas.js

Covers the ideas board: what shows at each status, the schedule-it path,
editing, and that idea category chips write to idea_categories.

    node test/metrics.js

Covers the statistics: the derived maths, that a blank stays blank while a
zero stays zero, the season roll-up, and which past programs get chased.

    node test/runsheet.js

Covers the moderator's run sheet: the four phases, progress, speaker
contacts and pronunciation, the sponsored-program warning, and the ways in
from the program page and the season card.

Assertions here look for markup in context — `class="card"` followed by
`cat-tags` — not just the presence of a word. A check for the text
"Student Loans" passed for weeks while the card rendered no tags at all,
because the filter chips contain the same words.

    node test/calendar.js

Covers the two things asked for on 2 November 2026: the "Needs attention"
roll-up and the month/quarter calendar.

Both are easy to test wrongly. An alert row is in the markup whether the
panel is open or shut, and a program title is on the page whether or not
it reached the calendar — the cards print it too. So every assertion cuts
out the one element it is about first: the roll-up `<button>`, the
`alerts-list` div, or a single month's `<section class="cal-m">`.

The clock is pinned (`todayUTC` is reassigned to 2 Nov 2026) because
"today is marked once", "two of four upcoming" and which programs fall in
Q4 all move with the real date. The fixture deliberately holds a program
either side of the period on show, an archived one, and one of each
condition the roll-up counts.

Note that the day cells, the dots and the per-month list are all rendered
every time; CSS decides which of the three a given width shows. A test
that asserted "the titles are in the cells" would therefore pass on a
phone where they are invisible — hence the separate assertions that the
list exists and that the dots do.

    node test/suggestions.js

Covers the suggestion board and the build plan it doubles as. The list of
statuses and areas is written twice — `SUGG_STATUS` / `SUGG_AREAS` in
`index.html` and the CHECK constraints in the migration — so the first
block reads the migration and compares the two in both directions. A
value the UI offers and the database rejects shows up only as a toast.

    node test/comments.js

Covers commenting on a suggestion.

The thread is shut by default, so almost every assertion about a card
would also pass with the whole feature deleted. The open/shut pair is
what catches that, together with the count on the shut card — and the
helpers cut out one card before asserting anything, because a comment
body and a suggestion title are both on the page regardless.

Two things here are claims about the database, asserted from both sides.
The **Delete** link is an authorisation claim: RLS allows deleting only
your own comment, so offering the button on someone else's is a promise
the database will refuse. And the textarea id is written twice —
`id="sc-body-<id>"` in `suggestionThread()`, `val("sc-body-" + id)` in
`addSuggComment()`. If those drift, Post silently sends an empty body and
the symptom is a toast telling you to write something in a box you just
typed into.

A comment is the only text on that screen somebody else wrote, so
escaping is tested with a real `<script>` tag rather than assumed.

The clock is **not** pinned here, unlike `calendar.js`: nothing in this
feature does date arithmetic, and the timestamps only have to render.

    node test/kinds.js

Covers the eleven program types NACBA runs, added 2 November 2026 at
Rachael Hodgen's request. Checks that all eleven are offered in the order
she listed them, that `paid` is still first and still the default, and
that the two retired types behave: never offered for a new program, but
still offered — and selected — when editing a program already set to one,
so a row saved before the change stays editable.

Also pins the in-person rule, which is the easy thing to get wrong: a
Virtual Workshop session is a workshop but is *not* in person.

Every assertion reads inside the `<select>`, extracted by id. Asserting
the bare label would pass even with an empty dropdown, because program
cards print type labels too — the same trap `roster.js` fell into.

    node test/bio.js

Covers the bio builder, and is the first test to touch `speaker.html` at
all — the page speakers actually see had no coverage until now.

It renders the packet, then asserts the fields are really inside
`<section id="bio">`, extracted by id. That matters here more than
usual: this project has twice shipped a click handler with no markup
behind it, and a bio textarea is invisible in exactly the same way.

It also pins the RPC names and argument names the page sends. A typo in
an RPC name is silent until a speaker presses Save, and no amount of
rendering catches it — so the names are additionally cross-checked
against the migration by hand when they change.

Two traps this harness hit, worth knowing if you extend it: the
bootstrap IIFE at the end of `speaker.html` opens with
`(async function () {`, not an arrow, so cutting it by searching for
`(async () => {` silently truncates the module at `wireBio`. And the
bio load is asynchronous, so assertions about prefilled values must
await a tick or they read empty fields and look like a broken feature.

    node test/assign.js

Covers task assignment: who holds each role on a program, the inheritance
rule, the per-task override, and the bulk Assignments grid.

Three traps drove how this one is written. First, the inheritance rule
exists **twice** — `inherit_assignee` in SQL, for the triggers, and
`inheritedAssignee` in JS, for releasing a task back to the program's
people. They can drift apart silently, so the pure-logic block pins the
JS side including the case and whitespace folding; if you change one,
change both.

Second, a render test cannot see whether the data ever arrives. Every
assertion about a dropdown would still pass if `loadData` never asked for
`program_people`, because the rendered markup is identical when the field
is simply undefined — everything reads "nobody". The last block therefore
greps `index.html` for the query, the upserts (including `onConflict`,
without which an upsert inserts duplicates), and each change handler.

Third, the people on a program started as two columns
(`programs.coordinator_email` / `moderator_email`) and are now a table
keyed on role. A fixture still carrying those columns would hide a
regression, because reading a dropped column returns `undefined` rather
than throwing — so the fixture deliberately omits them, and two
assertions check nothing in the source still reads them.

Worth knowing: `personLabel` and `personFor` read module state, so a test
that calls them before any `draw()` sees an empty team and gets the
fallback. Seed `team` and `progPeople` first.

The set-all control is asserted to start blank. If it ever renders with a
value selected, a `change` event on first paint would write that person
to every upcoming program.

The fixture uses invented addresses (`coord@example.org`). This repo is
public — no real person's email belongs in a committed fixture.
