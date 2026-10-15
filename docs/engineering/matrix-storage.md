# Matrix storage (P06-b development)

Explicit Productivity migration6 adds `productivity_matrix_overrides`. Its
view/task foreign keys, quadrant, integer view/config revision, integer pin
revision and optional UTC expiry support private per-view placement. View
configuration/rule AST remains in the existing actor-owned `productivity_views`;
there is no second configuration store.

The original three-column pilot `productivity_matrix_pins` table and all migration
1–5 DDL/checksums remain unchanged. Its unversioned rows remain historical data,
with no trusted current placement behavior. This avoids rewriting old snapshots
or extending I01's registration API. Snapshots discover the new registered table
only when it exists. Startup inspects current schema6 and its exact new table/index
SQL; it does not apply migrations. Earlier versions1–5 remain supported.

Snapshot/recovery validation checks override task/view references, positive integer
revisions, optional strict UTC expiry and current-config Matrix kind. Older config
revisions remain preservable but are ignored for current placement. Compatibility
manifests advertise Productivity1..6 and Wallet1. Synthetic compiled verification
must independently start1–5 without upgrade and exercise6/restart/ordinary and
encrypted recovery plus future7 refusal before accepting this work.

Authoritative Matrix preview/apply, field ACL, expiry/config invalidation, atomic
writes and audit are implemented in the development branch; exact-HEAD Windows
acceptance is still required. Whole-branch review found no Critical/Important
issues; two Minor input/conflict status issues were corrected with HTTP regressions. No Matrix UI, default activation,
release/tag or VPS operation is introduced here. Actual Server2019 acceptance
and the performance targets remain separate.

## Internal commands

Existing sessions authenticate GET `/api/productivity/matrix/:viewId`, POST
`/matrix/preview`, `/matrix/apply` and `/matrix/reset-pin`. These routes are scoped
to the application; there is no public integration/token surface. Caller clocks
and actor overrides are refused. The server captures UTC plus a named timezone
(default Asia/Saigon), and fetches actor-owned configuration and authorized SQL
rows before filtering/counting. Responses contain curated canonical TaskRecords.

Preview tokens bind actor/role, task/view revisions, target/mode, clock/local day,
minimal proposed patch and current pin revision. TTL is five minutes. The cache
has256references and16MiB serialized payload; full task bodies are not cached.
Payloads expire after five minutes, with owner-only expiry identity retained for
five more minutes. Identity references count toward the256limit until retirement;
full allocation can return429 until ten minutes after issuance. Foreign references
remain404; a recent expired owner gets409. P18 owns performance/resource tuning.

Apply repeats fresh ACL before I01 cache access and inside the writer, then checks
token/time/day/revisions and reclassifies the proposed result. Attribute mode also
rechecks edit rights before cache access, so a write-to-read downgrade cannot
replay a mutation result as an authorized edit. Exact successful retries can use
I01 after process restart even when ephemeral previews are gone; a new request ID
still requires a live preview. The request hash binds mode and confirmation.

Priority/deadline/assignee/tag choices use the existing task update validation and
legacy history within the same transaction. No completion, reward or recurrence
command is dispatched. Date changes require explicit confirmation; unresolved
custom rules cannot apply. Structural list/section changes are not guessed through
the generic TaskPatch: custom rules can require an explicit supported choice or
a view pin. Existing structural commands remain separate.

Pins are private view preferences, may expire, and never change task attributes
or task revision. Config changes invalidate placement until reviewed again.
Reset/attribute mode expire an existing override and increment its revision rather
than deleting it, preventing an old preview from passing an ABA check. Command
results retain exact field/pin before-after deltas. Any failure rolls back task,
pin, history and nonce together. Metadata invalidation is actor-only; real task
edits retain the existing task audience rules.

Pure P06-a historical skipped-date Minor M1 remains P18-owned. Current projection
uses the existing authorized task reader and common filter predicate; reference
latency/load targets have not been measured. No Matrix UI is claimed before P07.

Malformed assignee choices are refused as typed input before native binding.
Applying an existing preview after its owned view changes kind returns409;
starting a new Matrix projection/preview on a non-Matrix view returns422.
