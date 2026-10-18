# Kanban creation, quick-add and Section ordering

Functional checkpoint, 2026-10-17 (Asia/Saigon). Source commit
`e7c7c7d4af0e06075ef701e2caa41807c431bcbb`, based on the earlier feature-first
checkpoint `4ab482d091744556b0a6a7fb0a8f682cf3ce1eee`.

Managers can create a canonical Section/Workflow board view through an explicit
draft. One I01 transaction creates the shared board if needed and saves the
actor-owned view. Reusing an existing board preserves its WIP, columns, ranks and
revision. Failure rolls back allocation; one UUID replay returns one result.
New views initially use no grouping and custom rank ordering.

Quick-add opens an editable title/priority/optional all-day deadline/sharing draft.
Cancel writes nothing. Confirmation creates directly in the selected Section,
using the current board/view revisions and existing Task writer/WIP invariant.
Workflow quick-add starts only in Todo. The new Task has no approval, proof,
assignee or reward. A known conflict keeps inputs for an explicit context refresh;
an unknown send locks the original body and UUID for a manual outcome check.
Current quick-add is limited to managers and canonical ungrouped boards.

On rank-sorted Section boards, manual ordering offers a visible before-card
anchor or the end of the column. It uses the original server preview/apply,
clock, expiry, authority, lane and revision checks. Cancel leaves order intact;
same-column apply changes only rank. Noncustom sort does not expose reorder
controls. Workflow/grouped rank UI remains outside this checkpoint.

The new internal authenticated routes are `POST /api/productivity/boards/views`
and `POST /api/productivity/boards/tasks`. They use the existing session and I01
command owner, with live manager rights before cached-result lookup. They add no
public integration API, tokens, dependencies, schema or automatic migration.

Cloud verification passed6185tests/334files with matchingJUnit, zero failures,
skips or todo; lint/build exit0. All6108parent cases remain, plus77new cases.
Only the fresh temporary root in five unchanged recovery-retention test names is
normalized for identity comparison; multiplicity is preserved.

Actual Chromium C22/C36/C40/C44/C45/C46/C47/C48 and native touch passed8+1first
attempts, offline, with matchingJUnit, DB integrity, native close and cleanup.
C45 proves a delivered200/lost acknowledgment keeps one native UUID/body and one
view. C46 proves canceled draft/no writes, one direct classified Task and real
UUID replay. C47 proves cancel/rank-only/no Task-field change/noncustom refusal.
C48 proves revoke→restore does not resurrect an old private draft.

The original C48 control reused an admin session invalidated by logout and
returned401; retained as noncausal. A separate real synthetic admin login corrected
the control. Revocation-only then passed, but restoring rights exposed the retained
private draft. The owner now retires state after completed catalog confirmation of
lost rights, preserving requests through transient authorized refreshes. The full
unchanged revoke/restore assertions pass. Failed reports and DOM/trace remain.

One LOCAL whole-branch SELF review of31source/test/locale files:0Critical,
0Important,0Minor; no independent-review claim or rereview. Compact source/report
hashes and actual failure history:
[m1-kanban-creation-development.json](evidence/m1-kanban-creation-development.json).

The development branch can be pushed without opening a PR: CI only runs for
pushes to main, PR events or manual dispatch. Branch protection and final Windows
checks remain required before merge. Full48-case browser, Firefox/WebKit/current
Windows/package/service and Server2019 R02 qualification remain unrun here.
No release, tag, VPS access or deployment occurred; full M1/master is not complete.

Next: complete remaining M1 view editing/grouping/sort preferences, Workflow and
grouped ordering/drag UX, then close the M1 acceptance checklist before Wallet core.
