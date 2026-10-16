# Active Workflow transitions (P08/P09)

This slice is implemented on the development branch; exact-HEAD Windows
qualification is still pending. It does not complete P08/P09/P10 or M1.

The current authorized Workflow board offers a separate status action for an
active Task. The dialog lists To do, Doing and Waiting, excluding the current
column. Choosing a destination does not preview or write automatically. A fresh
server preview and explicit apply are required; Escape/cancel leave all Task,
reward and notification facts unchanged. Completion and approval keep their
existing P10 actions. Review, Done, Won't do and Trash are not active-transition
destinations, and pending/terminal Tasks do not expose this action.

The internal session routes are `/api/productivity/boards/workflow-transitions/preview`
and `/api/productivity/boards/workflow-transitions/apply`. They use current
actor/object ACL, an owned saved view, source/target board membership, bounded
15-minute previews, Task/view/board revisions and the captured local day.
A namespaced I01 command receipt binds the UUID to its complete payload. Cache
replay rechecks current authority; reconstructing the preview owner can replay
an already committed UUID but cannot invent another command from its old token.

Only lifecycle, blocked and blockedReason may change semantically. Waiting sets
blocked and retains the prior active lifecycle/reason. To do/Doing clear blocked
and its reason. The canonical writer records history, preserves deadline,
identity, proof, points and recurrence metadata, and updates all board positions
in the same transaction. Full-scope hard WIP includes private rows and is checked
at write time; soft WIP warns before apply without revealing a hidden exact count.
A failure after position update rolls back Task, legacy projection, board,
positions, notifications, rewards and command receipt. Successful HTTP emits
scoped Task/catalog invalidation and no reward invalidation.

Pending Review also offers explicit adult approve/return confirmations through
P10's existing Task commands. Return requires a nonblank reason; cancelling
writes nothing. The SDK retains Task revisions and validates the actual P10
receipt. A separate Task-owned controller keeps the original operation, reason
and UUID after an unknown network result, never retries automatically, requires
a fresh read after HTTP4xx and drains old-owner responses without publication.
Review command ownership lives in the persistent API-session workspace, above
ready/page guards and board-revision keyed projection components,
so unrelated board refreshes do not discard an unresolved command. Draft reasons
are owned by actor/API/view, retained across an explicit reload, and erased on
authority denial or terminal Task state. No board-specific reward writer exists.

The SDK rejects unknown fields, changed immutable Task facts, fabricated counts,
wrong columns/revisions, terminal/approval results and non-workflow patches. The
shared command controller suppresses stale or old-actor results, serializes
apply, retains the UUID only for explicit retry after an unknown network result,
and never retries automatically or guesses a committed Task state. Its typed
error state does not retain raw server text.

Cloud evidence currently covers domain/HTTP/SDK/controller/static UI and actual
keyboard preview/cancel/apply with retained proof and no reward changes. Existing
completion and conflict/reload/proof flows also pass on Chromium. Cloud is not
Windows qualification. No dependency, migration, default storage activation,
public API, release, VPS or Server2019 acceptance changes here.

Remaining M1 work includes Workflow and grouped pointer/touch drag, precise rank
controls, board settings/quick-add/large-list UX, filtered-out move feedback/semantic undo and the remaining P10/rollout checks.
These remain explicit gaps until their own implementation and Windows evidence.

One LOCAL whole-branch SELF review found I1: an ordinary board reread disposed
the unknown Review UUID despite retaining its reason. C39 first failed after a
real authorized board GET200 because the reason unexpectedly became editable.
One correction moves command lifetime into the persistent workspace; pending
facts remain hidden, actor/explicit-view changes retire it, and native retry
retains the original UUID and payload. C39 and seven interacting browser flows
then pass, together with trusted Matrix/Section touch; no rereview is claimed.


CI135 composition uses accepted parent943d958 (tested31568c0/run38977366988),
with Chromium1 and Firefox/WebKit2. The supplementaryC36–C39 registrar stays on
the lighter Firefox/WebKit core entry; Chromium registers C01..C39 in original
order through one hook owner. Every39original test call and23fixture helper
bodies, offline/zero-error hooks and the complete native-touch file are verified
unchanged from17e4291. All27application/source-test/locale hashes remain exact.
No feature logic or deadline was changed to resolve CI integration conflicts.

Composition Cloud qualification passes5911tests/321files/matchingJUnit/coverage,
661related checks/lint/build0 and39Chromium+1nativeTouch/matchingJUnit/native0.
The unit-case multiset retains both previously passing suites: four identical
13Task fixture regressions shared by135/134 are counted once, plus a new complete
registration check. Current source/parent overlays/report hashes are recorded in
`evidence/p08-active-workflow-ci135-composition.json`; original review/I1 and prior
failed Windows checkpoints remain historical. Fresh exact-HEAD Windows still
must pass5911/321perNode/all39cases on three engines/163first attempts. Main135
runs independently; its result is not assumed. FullM1/P08/P09/P10 andServer2019
remain incomplete; no release/tag/VPS.
