# P05 authorized query and selection engine

P05-a provides an internal read engine over the existing canonical tables. It
checks the current actor before every query or selection lookup. SQL applies
task/ancestor visibility, facets and root/tag predicates before task decoding.
A task with two matching tags still contributes one ID and one count.

The engine reuses TaskFilter/QueryClock. Search currently applies the existing
accent-insensitive Vietnamese predicate to authorized candidates. This slice
adds no persisted search index: the P05-b storage/HTTP/UI slice owns that adapter
and performance work; full P05 is not accepted by this engine alone.

Pages use stable rank plus ID, at most100 items. A cursor binds actor, filter,
clock and visible ID/revision/rank digest. A changed result set returns409,
requiring a fresh first page. Cursor contents grant no access; SQL rechecks ACL.

Selections collect every matching ID across pages, expire at15minutes and belong
to their original actor/role. Consumption rechecks live actor, visibility, IDs
and revisions; another actor gets404, expired/stale data gets409, malformed
reference/clock gets400. Clock arguments are trusted domain inputs; the later
HTTP owner must capture server time and must not accept a client expiry clock.

Inbox explicitly selects no-date active tasks. Today/Next7 use half-open local
day ranges. Assigned, Overdue, Completed, WontDo and Trash are typed filters.
Completed windows7/30/90/all use a read-only completedReferenceAt: retained legacy
completedAt first, updatedAt fallback when valid, null when unproven. This is a
compatibility filter reference, not a new accepted completion event. The all-time
window keeps completed tasks without a reference. The field is a query projection;
P05-b owns its curated HTTP/client DTO wiring. P10 still owns new workflow writes.

Trash reads use the same role/list/ancestor visibility while allowing deleted
records. Existing ordinary reads/writes retain their default deletion exclusion.
No restore/reopen mutation is added here. P05-b must make deleted drawer entries
read-only when wiring this projection.

All fixtures are synthetic and offline. No schema upgrade, new route, frontend
view, activation, dependency, release or VPS operation is part of P05-a. Existing
Windows checks and all75 first-attempt browser cases remain required. Server2019
acceptance remains R02 and has not run.
