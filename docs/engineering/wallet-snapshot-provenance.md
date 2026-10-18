# Wallet snapshot provenance and category integrity

W02partial Cloud checkpoint, 2026-10-17 (Asia/Saigon), source `2496a3b4d4ecd06a80854d5ff24017b6d8ca4f87`,
based on `074a46ca5f9c8e9f90ae6ef487d6643fe7141426`.

A correct checksum no longer admits unknown Wallet record creators or audit
actors, or a cyclic category graph. Restore validates all relationships before
SQL writes; the shared I01 coordinator rejects the same corruption before even
entering maintenance. Module export also checks the current complete legacy user
ID set so it cannot emit a snapshot that later fails those provenance checks.

Identity and live authorization are separate: a known historical creator/audit
actor remains a valid reference after deletion or a change to Child role. This
does not authorize a new finance command. An iterative completed-path walk checks
category ancestry without recursive stack growth. The real12000-category restore
and exact signed64 money checks are retained.

Three corrupt-restore cases and two corrupt-export cases were observed RED before
correction. Shared coordinator tests cover the same three corruptions and prove
no maintenance/onBoundary call, no SQL total_changes and no legacy mutation.
All40targeted Wallet cases pass. Full Cloud6379tests/343files/matchingJUnit,
0failed/skipped/todo; lint/build0. All6369parent tests retained+10, normalizing only
the five unchanged recovery-retention temporary-root names with multiplicity.
One LOCAL SELF3paths0C/0I/0M/no correction/rereview; not independent.
[Compact evidence](evidence/w02-snapshot-provenance-development.json).

Frozen Wallet migration1/DDL checksum, snapshot protocol2, activation, dependencies,
lockfile, workflows and finance routes/UI are unchanged. This is an integrity
slice; W02full entities/metadata/attachment manifest, W03migration, W04account
rights and W05Wallet core remain unfinished. No new Wallet UI or live financial
write is claimed.

PR URL/CI run URL:none; development branch:`codex/feature-first-acceptance`.
Windows/Node22/package/service and Server2019R02 have not run for this source.
A new browser run was not needed for the backend-only validation slice; the last
M1browser evidence remains bound to its own frozen3560source and10+1scope, not
this new server bundle. Final group Windows qualification remains required before
merge. No release/tag/VPS access/deployment occurred.
