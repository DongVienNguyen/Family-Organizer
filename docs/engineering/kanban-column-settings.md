# P09 Section column settings

List managers can create, rename, order and archive Section columns from the
canonical ungrouped Section board. The built-in None column can be ordered but
cannot be renamed or archived. Workflow columns retain their lifecycle meanings.

The internal session API reads current authorized column metadata without Task
bodies or counts. Every change binds the owned view, board and expected revisions
and uses the existing transactional command UUID. A cached receipt is checked
against the current board scope and current management permission before return.
Creating, renaming and ordering columns preserve Task deadlines, proof, lifecycle,
reward metadata and reward balances.

Archiving first returns a read-only preview for the whole Section, including
Tasks outside the saved view filter. The dialog explains that scope and requires
a separate acknowledgment before confirmation. Applying rechecks the preview,
Task digest, revisions and destination WIP capacity in the shared transaction.
It moves undeleted Tasks to None; it does not complete Tasks or grant points.

One command owner lives above transient board and authorization reads. A response
lost after a real server commit retains the original immutable body and UUID.
An explicit outcome check reuses that packet; reads never resend it. Actor/API,
view or board retirement and an authority refusal discard private state. Pending
writes drain before another dispatch, and a successful acknowledgment clears the
packet before subscribers can initiate another action.

The three new browser scenarios follow the existing 39 scenarios:
metadata create/rename/order with nonempty proof/deadline/10point preservation;
whole-Section archive with an off-filter Task, cancellation and native UUID
replay; and a delivered HTTP200 whose client acknowledgment is lost, followed by
an unrelated authorized refresh and exact manual replay. The original native
Matrix/Section touch test remains unchanged. Chromium uses one complete store;
Firefox/WebKit use two isolated complete stores with 22/20 scenarios. A real main134 WebKit C36 trace exhausted the45-second total budget after
11748ms of UI login operations. C36 and the new column fixtures now establish
real server-issued synthetic sessions through the internal login endpoint and
Playwright context storage state. Both visible role/workspace assertions and UI
logout remain; the original UI login helper and mandatory foundation form tests
are unchanged. Every existing workflow/column semantic assertion remains. This
actual post-review validation repair is recorded separately. No deadline,
retry or assertion is relaxed. The current inventory is 42 per engine; historical
39-case reports remain readable only against their historical source policy.

This is one P09 slice. Remaining board settings, WIP editing, quick-add, rank/drag
and P10/M1 acceptance gaps are not marked complete. Windows2022 CI does not
establish Windows Server2019 acceptance (R02). No release or VPS operation is part
of this work. Exact source, review and test receipts are recorded in
`evidence/p09-columns-development.json` and the PR's exact-HEAD CI proof.


PR136 first Windows checkpoint4dee93e exposed a session-fixture race: the next
session could be issued while the old page's privacy cleanup still persisted a
null token. C36 Firefox/WebKit and C41 in all three engines failed the retained
child-profile check. Both6032-test unit reports passed independently; the overall
run failed. A real held IndexedDB deletion reproduced premature issuance1instead
of0 in Cloud. The helper now waits for the old login portal, retires the App via
an owned readiness JSON document, and then issues/seeds the next session. Parking
at an opaque document initially triggered the unchanged language initializer's
SecurityError, which the zero-error assertion caught; that failure is retained.
The owned document avoids the illegal access without changing or filtering guards.
C36 permanently exercises held logout cleanup, zero early issuance and exactly
one subsequent real child login before its original workflow assertions. The
causal diagnostic and all four affected journeys/nativeTouch passed after repair.
No production bundle, dependency, test deadline or retry policy changed. Fresh
exact-HEAD Windows qualification is still required; no unchanged CI rerun.
