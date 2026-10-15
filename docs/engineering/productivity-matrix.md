# Matrix calculations (P06-a)

`src/features/productivity/matrix.ts` computes a projection from already-authorized,
already-filtered canonical rows. It does not grant access, fetch rows, create a
trusted server preview, persist a pin or apply a command. P06-b must query under
fresh actor ACL, read the actor-owned view, issue a five-minute preview and
revalidate task/config revisions, clock/day and field permissions before I01 apply.
P07 owns actual Matrix UI and accessible drag/keyboard confirmation.

The deadline/importance preset treats high/medium as important. An active task
is urgent when its deadline starts before the exclusive local start of
`today + horizonDays + 1`; no-date is nonurgent. The default horizon is supplied
by the view (normally1). Named timezones and real local-day boundaries handle
DST. Priority-only maps high/medium/low/none toQ1/Q2/Q3/Q4 independently of due.
No clock is read from the host: every calculation receives an explicit clock.

Custom typed AST conditions are validated by the existing ViewConfig contract:
32conditions across the view, depth4, no executable expressions. Relative due
windows are resolved once for the projection. First match follows quadrant order;
`matches` retains all matches, unmatched rows remain in a tray, and total counts
unique IDs. Duplicate input IDs fail. Returned rows are cloned. Deleted and
WontDo rows are excluded; completed rows require showCompleted and are nonurgent.
The server query owns roots, facets and private rows/counts before projection.

`proposeMatrixMove` returns an untrusted proposal. Priority-only changes only the
priority. Deadline/importance retains an already-correct importance class, and
any proposed date change carries `deadline-change` plus needsChoice. Custom
rules return needsChoice with no guessed executable patch. View-pin mode carries
no attribute patch. Terminal/deleted tasks cannot be proposed for a move.
These proposals are never valid server authorization or an apply token.

No new schema, migration, internal route, UI activation, dependency or release is
introduced by P06-a. Full P06 remains pending authoritative preview/apply,
revisioned/expiring pin storage, audit, rollback, recovery and API regressions.
