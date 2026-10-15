# P08-b6 — internal board read projection

`GET /api/productivity/boards/:viewId` resolves an existing actor-owned saved
Kanban view with its semantic8 canonical board reference. The existing session,
current user/role and active list ACL are checked on every read, including each
page. Legacy unbound views remain unchanged and return422 here. This first read
slice supports sections/workflow with group:none and sort:rank; other grouping or
sort choices return422 until their implementation.

Task scope, ancestor visibility and grants are applied in SQL before reading Task
bodies, provenance, tags or position rows. Canonical columns come from the shared
board and active sections, including immediate exclusion after an existing section
archive. Tasks keep canonical IDs and lifecycle; a section named Done completes
nothing. Position metadata supplies per-board order, with a Task rank fallback for
missing lazy positions. Reading never seeds positions or mutates Task/view rows.

Card counts include visible filtered cards only. Every non-admin receives the same
`activeRootCount:null, visibility:redacted` WIP shape. Admins receive a separate
trusted full-board active root count: filters do not change admission capacity,
children/terminal/trash rows do not consume slots, and blocked/review roots do.
The existing transaction invariant still owns all write-time WIP enforcement.

The read budget covers the **whole actor-visible list before view filtering**:
5000Task rows,16MiB UTF-8 title/body/provenance bytes,20000tag links and1000active
columns. Scalar ACL SQL checks these bounds before body decoding. Within these
bounds the existing canonical query engine filters once in memory and cards are
partitioned/ranked once. Pages contain at most100cards (default50). This is bounded
in-memory pagination, not SQL keyset pagination or large-data/P18 acceptance; a
large visible list can return422 even when the saved filter would match few cards.

A process-local HMAC signs stateless page cursors containing a server-owned clock,
offset and digest bound to actor/role, view/board revisions and visible Task
identities/revisions/ranks. Fifteen-minute expiry or changed visible state requires
a refresh409; malformed/foreign-process signatures return400. Restart loses the
signing key, so clients refresh the first page. Callers cannot supply actor, clock,
page size or raw SQL. No preview/move/override/admin audit/UI/completion behavior
is added by this read endpoint.

The schema8 bundled-ZIP probe additionally exercises actual admin/child owned-view
GETs, canonical IDs, private WIP redaction, foreign-view404, caller clock400,
server clock and unchanged domain rows. All earlier14checks and process/refusal
vectors remain required. Cloud checks are diagnostics; exact-HEAD Windows reports
must pass before acceptance. Windows2022 is not Server2019/build17763 acceptance.
No release/tag/VPS operation or default migration activation is authorized here.
