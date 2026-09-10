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
