# P08-b7 — section moves, ordering and explicit WIP exceptions

The existing internal session-authenticated board API adds preview/apply commands
for moving a Task between sections of the same canonical board and reordering a
Task within its current section/workflow lane. A section named Done preserves the
Task lifecycle. Workflow transitions across lanes remain422 until the P10 semantic
completion commands are integrated; no approval, reward or notification writer is
introduced here.

Preview reads canonical state without writes and returns an actor-owned opaque
reference, server clock, Task/view/board revisions, target column, derived
`operation:section|rank`, and before/after Task records. Apply must echo the exact
operation and revisions. Source Task/view/list/target ACL is checked before the
I01 cache and again inside the single transaction. Section operations retain the
existing structural list-write policy even when the Task already occupies its
committed destination; a revoked grant cannot replay an old successful response.
An exact committed UUID retry can survive a process restart after fresh ACL checks;
a new UUID requires a live preview. View/Task/board/lane/day changes or expiry
require a fresh preview.

References are bounded to128 and16MiB with15-minute live payloads and a further
15-minute owner identity window. Returned preview objects are cloned; changing a
returned clock or Task cannot mutate retained authority. Lane membership/order is
read as bounded scalar identities/ranks; private identities and full WIP counts
never enter response DTOs. Visible rank anchors must belong to the target lane
and current saved-view filter.

Ordering uses the existing gap/midpoint/rebalance planner and changes board
position metadata, preserving canonical Task ranks. Valid negative legacy ranks
with missing lazy positions cause a complete positive metadata rebalance. Section
moves reuse the existing structural transaction helper and central Task store,
which enforces hard WIP against the whole canonical active root scope. Reorder
within the same lane consumes no new slot, including after a limit is lowered.

Only a current SQL admin can explicitly exceed a full hard limit with a nonempty
reason. Its permit is bound to the exact live transaction, Task, board and column,
consumed once and cleared in finally. An admin actor alone grants no bypass to a
generic or legacy writer. The supplied immutable audit entry must actually be
persisted in Task history in that transaction; otherwise the admission rolls back.
History and the namespaced command outcome survive shared snapshots. A capped
activity log alone is not the audit record. Exceptions without a real blocked
entrant, async work, nested permits and wrong identities are refused.

Task/position/rebalance/audit changes commit or roll back together. Rank-only
changes emit scoped board metadata invalidation; changed Tasks also emit the
existing Task invalidation to authorized audiences. Tests use synthetic data and
no external providers. Existing schema1–8/Wallet1 identities remain unchanged.
The schema8 bundled-ZIP probe adds the16th required check for real section moves,
retry after restart, full WIP refusal, explicit audited override and preserved
Todo/points; all earlier15checks/process/refusal vectors remain mandatory.

Cloud results are diagnostics until exact-HEAD Windows reports are independently
read. Full P08 grouping/archive preview, P09 UI and P10 completion remain separate.
No default activation, release/tag, VPS or Server2019 acceptance is implied.
