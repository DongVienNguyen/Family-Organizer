# P10-d1 durable recurrence configuration

This slice stores explicit recurrence configuration and future exceptions. It
adds no route, scheduler, occurrence generation, automatic migration, completion,
reward, assignment or notification effect. Default registry remains6; the pilot
must explicitly register existing upgrades through9 and then series migration10.
Existing migration checksums and prior table DDL remain unchanged.

## Storage and authority

productivity_series has one unique root Task, canonical policy and original due
anchor, revision, next ordinal, accepted count, rotation cursor and timestamps.
productivity_series_exceptions stores a versioned skip or explicit due intent per
future ordinal. Due-none is distinct from skip. Task fields, occurrence rows,
legacy points, Wallet and notifications are untouched by configuration commands.

The current adult role and Task update grant are checked before cached command
replay and again inside the I01 transaction. Hidden and read-only series are
indistinguishable from missing objects. Creation checks expected Task revision,
active root lifecycle, due-base anchor/timezone and live rotation members. Legacy
repeat configuration requires a later explicitly verified cutover.

Initial rotation cursor captures the current assignee's index in the ordered
roster. An absent assignee uses its final index so the next accepted transition
selects the first member. Empty roster starts at0. Accepted count remains0 and no
Task assignment changes. Only later accepted-occurrence claims may advance it.

Future exception commands check expected series revision, ordinal/end bounds,
canonical intent, timezone and monotonic clock. The gateway receipt retains
series ID, ordinal, normalized intent and both resulting revisions; a retry still
returns current authorized series metadata. Exception, series revision and audit
receipt roll back together on failure. Requests cannot rewrite materialized
ordinals or act as delivery/reward authority.

## Startup, snapshots and compatibility

Normal startup validates stored canonical records and references before consumers
or jobs. A controlled valid encrypted restore may repair poisoned current rows;
the replacement snapshot is independently validated before mutation. Historical
soft-deleted users remain valid references; new series require live members.

Schema10 snapshots include both new tables and preserve legacy occurrence,
Task/board/tag/view, reward and Wallet data. Unsupported sparse/future/drifted
migrations are rejected before touching target bytes. Saved-view format remains9
on database schema10; invented saved-view format10 is still refused. Cold imports
open no storage and issue no network requests.

## Verification and remaining work

The one scoped SELF review graded0Critical/2Important/0Minor before a single
correction pass. Receipt auditing and rotation-origin regressions produced an
actual47case checkpoint with43passed/4failed, then394targeted tests passed after
correction; no rereview. Original zero-cursor assertions remain with explicit
child-assigned fixtures; new origin cases cover child/member/unassigned/outside
roster. Native encrypted restore/restart, corrupt startup refusal, unsupported
version byte preservation, ACL/current role, idempotency and rollback are covered.
Three new suites are mandatory in raw CI evidence and have omission regressions.

Full Cloud5009tests/271files and matchingJUnit passed with zero failures/skips; lint/build passed. Exact-HEAD Windows qualification is pending. Full P10 still needs
accepted-occurrence materialization/claims, series editing/skip, scheduler restart,
legacy cutover and UI/API integration. This storage slice does not enable them or
claim Server2019/R02 acceptance.
