# Kanban preview/apply client (P09-d)

The internal Task API exposes physical section/rank and selected-field grouped
preview/apply calls through its existing Bearer, no-store transport. Caller-owned
command identities survive an explicit retry; the client never retries a write
itself. AbortSignal and HTTP401/403/404/409/422 remain observable to the owner.
No menu, drag interaction, schema migration or default activation is enabled here.

Inputs admit only the existing server contract. Apply sends retained preview IDs,
Task/view/board revisions, the physical operation/column or bound tag target, and
the caller command UUID. It never sends an actor, arbitrary Task patch, raw rank,
clock or client-derived replacement for the server's retained transaction plan.
The browser-safe selected-field helper is extracted byte-for-byte from the
existing server implementation and reexported there; Node crypto stays outside
the browser helper. Cold imports open no storage or network.

Preview validation binds view/Task/revisions/timezone/expiry and checks that only
the requested section or selected priority/assignee/due/tag dimension changes.
Tag intents retain explicit all-tags add/replace semantics; an untagged target
cannot silently preserve other tags. Optional rank anchors remain explicit.
Acknowledgement validation checks canonical Task identity, unchanged fields,
Task/board revision effects, returned actual group membership and unique complete
tag projections. Canonical SQL tag ordering is compared as a set on apply.
Physical previews expose no numeric planned rank, so the acknowledgement can
validate an integer rank and board revision effects, not reconstruct exact order.

A command receipt can be historical after a same-UUID replay. It does not become
current read authority or populate the full canonical cache. The future UI owner
must reread the currently authorized projection/cache after a successful apply;
late responses, authority revocation, stale previews and ambiguous write failures
need explicit owner handling before enabling interactions. Workflow completion
continues to depend on the remaining P08/P10 work.

The closed whole-branch SELF found0Critical/0Important/0Minor; no correction or
rereview. Transport/admission tests and both old server grouping/cold-import
assertions are retained. A missing new suite fails the Windows evidence gate.
Synthetic response fixtures exercise selected-field preservation, malformed
previews/receipts, rank-only/no-op revisions, SQL-sorted tag acknowledgements,
AbortSignal, caller UUID and actual HTTP refusal propagation. They establish
client consistency, not a new server authorization or Windows acceptance claim.
