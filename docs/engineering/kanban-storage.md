# P08-b1: shared-board storage candidate

This preparatory slice defines an explicit, unconsumed SQLite schema. Current
runtime, migration and snapshot support remains productivity1–6; this module does
not register version7, accept its database images or enable Kanban commands.
P08 is not complete. P08-b2 must wire every canonical writer, transactional WIP,
ACL projections, revisions/idempotency/audit and migration/snapshot/recovery
before the schema is activated. P09 owns UI; P10 owns completion.

A board belongs to one canonical list; `(list_id,mode)` is unique for sections or
workflow mode. Private saved views will reference the same aggregate, so their
filters cannot create a weaker hard-WIP scope. Columns carry shared policies and
an aggregate revision; positions carry ordering metadata for canonical Task IDs.
Task section/lifecycle fields remain the membership truth. Missing positions are
allowed for lazy seeding; positions must never be the authority for WIP counts.

Compound native foreign keys bind columns to the same board/list/section and
positions to the same board/column/list/Task. An additional unique Task identity
index supports the compound reference without changing frozen table SQL. Task
deletion removes only its position metadata; populated column deletion refuses.
Future archive commands must move memberships and positions atomically first.
No task lifecycle, approval, reward, deadline or completion behavior changes here.

Ranks and revisions use JavaScript-safe SQLite integers. Native checks validate
policy shape (`off` requires no limit, `soft`/`hard` require a positive limit),
not capacity admission. Equal ranks are valid; P08-a determines stable order and
rebalance. Whole-column counts independent of private filters and atomic
concurrent admission are explicitly still pending.

`prepareBoardSchema` requires an explicit owner transaction and refuses repeat
DDL. `inspectBoardSchema` reads and compares exact owned DDL/indexes; it never
repairs a damaged image. `validateBoardStorage` adds native foreign-key checks
and canonical section/workflow membership checks, rejecting archived occupied
columns. These are trusted full-store helpers, not permission-safe response DTOs.
They are not invoked by the existing runtime or snapshot decoder in this slice.

Synthetic in-memory tests exercise same-list ownership, policy/integer checks,
metadata deletion rules, rollback after Task/position/revision changes, DDL
rollback, frozen Task/table preservation, all workflow precedence branches,
constraint/index drift and an orphan board created with foreign keys disabled.
The evidence gate requires this suite. Reports retain initial no-op-stub failures
and the separate causal review/gate omission failures; early missing-table throw
assertions are not evidence that native constraints were already implemented.
No release, VPS or Server2019 acceptance is implied.
