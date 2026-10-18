# P08-b2: canonical writer invariant, before activation

This slice attaches a trusted board invariant to `savePilotTask`, the existing
canonical repository shared by ordinary Task commands, structure commands and
legacy synchronization. Supported runtime images remain productivity1–6 with no
board tables: the invariant is inert there. Explicit synthetic candidate fixtures
exercise the future board tables. This does not register migration7 or accept a
new image, enable a board API/UI or complete P08.

Every prospective Task write checks shared list/mode boards. A hard-limit entrant
is counted from actual live root Task rows, including blocked/Review and hidden
or unseeded tasks, independently of private views and position metadata. Terminal,
trashed and subtask rows do not use root capacity. Existing over-limit members may
edit/reorder or exit without another slot. Generic and legacy writers have no
implicit admin override. Error messages contain no private Task title/ID/count.
Soft limits admit here; future permission-safe board projections own warnings.

The same I01 transaction removes old compound Task-list position references before
writing canonical fields, then restores same-lane rank or allocates/rebalances the
destination with the accepted P08-a planner. Affected shared board revisions
advance. Missing/archived target columns or revision exhaustion refuse. A throw
rolls back Task, position, rebalance and aggregate revisions. No provider/worker,
completion, reward or occurrence writer is introduced.

Tests use real synthetic I01 transactions and the canonical legacy bridge: direct
repository save and existing section move cannot exceed hard WIP; ordinary create
seeds metadata; blocked/Review without positions still count; serialized final-slot
entrants commit exactly one; legacy reopen refuses and completion releases
capacity; list moves satisfy compound foreign keys; subtask promotion cannot bypass
capacity; rank exhaustion rebalances and same-lane edits preserve rank; failures
restore state. These are not an HTTP/private-DTO/race benchmark or full migration
and recovery acceptance.

Initial fixture errors are retained separately: one test first called a nonexistent
`setSection` method before using the existing `moveTaskToList` command; expanded
fixtures needed to reset the seed between cases and preserve its existing7points.
Assertions continue to require unchanged lifecycle/points. The first three actual
missing-invariant failures and the mandatory evidence-suite omission are retained.

Remaining P08 work: explicit fresh-admin override reason/audit; shared configuration
ownership; preview/apply fresh ACL, private count suppression and stale revisions;
manual rank intents and grouping; version7 registry, old/current/future image
admission, shared ordinary/encrypted snapshots and compiled recovery; internal HTTP.
P09 owns UI and P10 owns new completion. No default cutover/release/VPS/Server2019
acceptance is implied.
