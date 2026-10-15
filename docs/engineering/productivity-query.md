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
Pruning expired payloads retains only reference/actor identity for the lifetime
of this in-memory engine, so unrelated selection creation cannot change owner409
to404. Restarting the engine discards its references; no persisted selection is
promised. The HTTP owner must bound engine/session lifetime and selection creation.

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

## P05-b1 explicit storage version5

The explicit pilot upgrade adds actor-owned saved views and a persisted search
document/trigram index. Existing versions1–4 remain readable without an automatic
upgrade; their SQL and checksums remain frozen. Version6 is refused before DDL.
The shared I01 migration/snapshot/restore owner registers all three ordinary
tables; no virtual/shadow tables, separate writer or SQLite extension is added.

Saved config validates kind/filter/config together, derives owner and server ID,
checks fresh roles before command cache access, and uses expected revisions and
I01 idempotency. Other actors, including another Admin, cannot read a private
view by ID or include it in counts. Guest writes are refused. Saved filters do
not grant access to their referenced tasks.

Search normalizes Vietnamese accents and đ consistently with the pure filter.
Canonical and retained legacy writes update the same document and unique Unicode
trigrams in their existing transaction. Queries with at least three Unicode
characters use an indexed candidate gram before task decoding, together with
SQL ACL/facets; the complete shared substring predicate still decides matches.
Short queries and lone-surrogate queries scan authorized candidates. This keeps
short, quoted, punctuation and title-newline-body behavior; no token-prefix
semantics are silently substituted. The current adapter indexes the full text
with ordinary inverted trigrams rather than FTS5: a synthetic FTS5 probe missed
two-character substrings, and the ordinary tables reuse exact shared restore
without special virtual-table exceptions. No benchmark acceptance is claimed.

Snapshot validation checks saved configs, owners and exact derived document/gram
coherence before any writes. Restore keeps canonical IDs and configurations,
without replaying notifications or rewards. The compiled package must prove
versions1–4 startup without upgrade and version5 restart/snapshot/encrypted
recovery/refusal. HTTP/session/client/UI wiring remains P05-b2-owned.
