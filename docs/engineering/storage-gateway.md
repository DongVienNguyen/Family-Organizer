# I01 shared storage foundation

I01 starts from main `06657385b15543840cee51c6da60f8fadba1daa5`, the
authorized squash merge of F03 PR #3. Its source HEAD `9009a66` passed Windows
run [38142720657](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38142720657):
216 tests in 24 files per Node22/24 job, all six command exit checks and CI gate.
The user now authorizes all reviewed, verified PR merges. Release publication
and VPS access/deployment remain outside authorization.

I01 is split into focused PRs: (a) gateway, migration registry and legacy writer
ownership; (b) consistent snapshots and durable job leases/retry/outbox. I01 is
incomplete until both meet the master plan acceptance tests. No new domain
features or live provider delivery are introduced by part (a).

The existing SQLite connection remains the only connection manager. Gateway
callbacks are synchronous, hold an immediate transaction, reject public nested
transactions and invalidate transaction handles after completion. Internal legacy
methods explicitly reuse the current transaction and document. Commands persist
actor, command, request ID, payload hash and result in the same commit; equal
retries return the prior result and conflicts return 409. Payload bodies are not
stored in the audit. Authenticated request context takes precedence over legacy
method actor arguments.

Legacy collections are compared against the document read inside the transaction;
only changed collections are persisted. Loaded documents saved outside the gateway
use collection conflict detection so stale full snapshots cannot overwrite newer
points. Seed/import/restore remain explicit whole-document operations. Domain
tables are never enumerated by legacy save. Activity writes nested inside a domain
method share its document and roll back together. SQLite errors propagate to the
caller. Notifications and media deletion are deferred until commit; durable delivery
and filesystem recovery are acceptance requirements for part (b).

Domain migrations require an explicit pilot context and enabled namespaces, run
contiguous versions in one transaction, record immutable checksums and refuse
unknown namespaces or downgraded code. Wallet/productivity version zero means
absent; neither domain is enabled by this PR. Runtime migration checksums must be
explicit constants, independent of TypeScript transformation/bundling.

Legacy writer audit and real Windows RED/GREEN evidence will be recorded below.
