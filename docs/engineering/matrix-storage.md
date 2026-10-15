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
writes and audit are still being implemented. No Matrix UI, default activation,
release/tag or VPS operation is introduced here. Actual Server2019 acceptance
and the performance targets remain separate.
