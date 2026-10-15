# P08-b5a: versioned saved-view board references

Reviewed source verified on Cloud3761tests/207files/matchingJUnit/all0;266target/4files/lint/build0. New exact-HEAD Windows acceptance remains pending. This
slice stores/validates canonical board references through the existing actor-owned
view API. Board GET/projection/private counts, preview/apply and UI remain later.

Kanban config may include a strictly typed optional `boardId`; old configs without
it remain valid. Explicit semantic migration8 defines this persisted JSON format
without table DDL or rewriting data. It first refuses unsupported references in7;
frozen1–7 migration checksums/DDL and Wallet1 stay unchanged. Default new migration
registration remains6. Ordinary known7/8 startup registers supported definitions
without applying migrations. Pre8 snapshots reject references even with recomputed
checksums; version8 validates reference existence and matching board mode.

Saving a new reference uses the existing internal authenticated `/views` route.
The server checks current actor, active list and read access before idempotency
cache lookup and again in I01. A shared-list child may bind its own private view;
a foreign private board or revoked grant refuses, and board mode is checked after
object authorization. Saving a view never grants Task access. Owned configuration
may retain a stale reference after archival/revocation, while every live board
resolution requires current object ACL. Restoration preserves that configuration
without sharing hidden Task bodies or replaying effects.

Tests exercise legacy config compatibility, schema7 refusal/no writes, migration8
preserving all native DDL and1–7 records, invalid old7 metadata refusing migration,
current8 snapshot integrity, real view-save HTTP sessions/retry/revocation and an
actual compiled CommonJS operator. The native fixture has distinct source/target
board references, Matrix pins and Wallet64-bit extremes; encrypted restore keeps
source identities, old7/index drift/future9 refuse without DB changes/journals,
and another process backs up the result. Review adds ordinary old7 backup with
migration/DDL unchanged, proving no automatic upgrade on that path.

ONE whole-branch SELF-review0Critical/0Important/1Minor was graded before one
test-only correction, with no rereview. The initial4/0/4 reference failures and
mandatory249/246/3 omission failures are retained. Original native7 test assertions
are unchanged; its historical future8 fixture still rejects an unsupported
checksum, while the new native fixture tests actual unknown9.

The current Windows package manifest/contract/schema still declare productivity
max6. Existing clean consumer/browser fixtures remain6. Compiled source evidence
for7/8 is distinct from running the promoted ZIP with those images. Updating bounds
and adding a new-schema actual-ZIP fixture is required before that acceptance.
Full P08, default cutover, release/tag/VPS and Server2019 remain unaccepted.
