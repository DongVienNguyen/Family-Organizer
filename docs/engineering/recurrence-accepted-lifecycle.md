# P10-d3 accepted occurrence lifecycle

Explicit pilot migration11 adds productivity_series_occurrences. Its native
FK/UNIQUE ownership binds one Task to one series/ordinal, with open or accepted
state, immutable recorded policy/due and actual accepted time/revision. Frozen
migrations1–10 and the old opaque productivity_occurrences table are preserved.
Default migration registration remains6; requests never migrate a database.
Saved-view format9 remains independent of database11. Old10 stays10 on restart,
future12 and drifted11 are refused before mutation. The shared snapshot/recovery
engine owns all domains, int64 money and command receipts as before.

The existing FamilyDB/I01 completion transaction owns acceptance. Child pending
and rejection create no accepted claim, successor, rotation or points. On real
acceptance, the same transaction records the root/current occurrence, uses the
existing linked grant/reversal writer, advances accepted rotation once and creates
one clean successor. A failed step rolls all of those back, including receipt and
notifications. The accepted legacy Task is flushed before constructing canonical
successors, preserving current list/section/ACL/tags/priority/reward fields and
existing board/search invariants. Source proof and history remain on the source;
next proof/comments/submission/approval/scheduled interval are cleared. Its only
new history entry identifies the accepted-generation event. Only authorized
unchanged Markdown inherits managed media through a transaction-bound capability.

Both semantic and existing legacy endpoints reach the same durable policy owner.
A legacy generic completion or reopen is scoped to the existing linked policy
for registered durable occurrences; unrelated legacy recurrence behavior is
retained. Retry, restart and fresh repeated completion cannot create a second
owned successor or rotate again. Reopen compensates the existing grant and keeps
immutable occurrence history and successor identity. A later completion may earn
its new linked grant but does not rewind or advance the already accepted slot.
An owned successor cannot be registered as a second series root.

Due-based dates use the original anchor; completion-based dates use the trusted
actual acceptance time. Explicit dates/count/end, skip and no-date exceptions
are honored. Skipping a virtual cycle or moving one outside the effective end
advances no reward/rotation; a later valid successor is retained. Count includes
rootordinal0. Unresolved DST refuses the entire transition422 until an explicit
canonical instant is provided, rather than accepting a guessed time. A root's
changed timezone or removed next recipient similarly requires correction before
acceptance; failed attempts have no partial grant/history. No scheduler/network
delivery runs here, and no client can supply acceptance time or rotation authority.

Owned-history coherence is checked on normal bootstrap and shared snapshot/restore:
known series/Task references, unique Task/slot identities, accepted root, cursor,
accepted count, at most one open occurrence, recorded policy bounds and accepted
revision/time must agree. Historical accepted revision can be lower than the
current reopened Task revision. Authenticated repair can replace corrupted data;
it cannot bypass unknown or drifted schema. Arbitrary old opaque occurrences
remain opaque, with their original IDs/payloads preserved.

Verification records are in evidence/p10-lifecycle-development.json once finalized.
Actual TDD/native fixture failures remain separate from successes. Full Cloud,
fresh whole-branch review and exact Windows qualification must be recorded before
acceptance; a build alone is insufficient. The native fixture compares every
collection data field as parsed JSON because shared recovery canonicalizes JSON
key order; all IDs/seq/values and domain rows remain asserted. Its known VAPID-off
informational prefix is explicitly checked, and network attempts must be empty.

This is not fullP10: explicit current-occurrence skip/edit scope commands, scheduler
restart/missed-cycle policy, editor/UI and controlled legacy recurring-task cutover
remain later owners. The closed preview MinorM1 extreme historical-anchor horizon
refusal remains deferred. No default feature activation, release/tag/VPS or
Server2019/R02 qualification is implied.
