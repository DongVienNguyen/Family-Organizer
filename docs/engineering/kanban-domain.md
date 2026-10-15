# Kanban pure policy slice (P08-a)

`server/productivity/rank.ts` plans manual ordering for one target lane. It validates
canonical IDs and safe nonnegative integer ranks, removes the moving row before
finding neighbors and uses gaps of 1024 or an integer midpoint. When no safe gap
exists it returns a deterministic whole-lane rebalance. Same-order moves preserve
the existing rank; equal legacy ranks use ID code-unit order. Inputs are unchanged.
The returned plan does not persist anything or authorize supplied membership.

`server/productivity/board.ts` classifies validated canonical tasks into workflow
columns. Pending approval maps to Review before blocked maps to Waiting; completed
and Won't Do are terminal, and Trash is separate. It does not change task lifecycle,
create points, rotate an occurrence or implement a completion command.

The WIP decision requires trusted, complete column rows, including active roots
hidden by a personal view filter. It deduplicates identical task identities and
refuses inconsistent duplicates, counts blocked/pending-review roots, and excludes
subtasks, terminal tasks and Trash. A new entrant exceeds a hard limit only with
an explicit trusted admin reason. Soft limits warn. Reordering an existing member
keeps the count and warning without consuming another slot, even when a column
already exceeds its limit.

These helpers are not an ACL, SQL query, API response or transaction. Do not return
their full counts to users who cannot see the whole scope. P08-b must read fresh
server membership/permissions and apply policy, positions, task/config revisions,
idempotency and audit in one I01 transaction. Concurrent-entry WIP races, private
count suppression, board configuration/storage/HTTP, section archive/Not Sectioned,
backup/recovery and grouping transitions are not accepted by this slice. Section
“Done” must keep lifecycle unchanged. Workflow Done must dispatch P10; no completion
workflow may activate before P10 acceptance. P09 owns the actual Kanban UI.

Input rows are bounded at 100,000 for each helper; rank rebalance returns at most
100,001 rows. This is a resource bound, not a performance measurement. Windows
benchmarks remain P18-owned. No schema migration, route, activation, runtime or
existing workflow changes are introduced here.
