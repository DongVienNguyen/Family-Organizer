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
controls, board settings/quick-add/large-list UX, approval/rejection controls,
filtered-out move feedback/semantic undo and the remaining P10/rollout checks.
These remain explicit gaps until their own implementation and Windows evidence.
