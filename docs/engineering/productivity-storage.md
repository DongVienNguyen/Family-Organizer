# Productivity storage integration (P02)

The default installation keeps existing legacy task storage until an explicit,
verified cutover. Runtime bootstrap installs the canonical compatibility reader
before FamilyDB is exposed. A persisted `productivity_active=1` installation
uses canonical tasks through the shared I01 gateway; configuration never silently
falls back to the emptied legacy task table. Bootstrap does not activate legacy
installations or create pilot domain tables.

Supported persisted productivity schema is v1 with the registered immutable
checksum. Unknown namespaces, future versions, invalid markers or incomplete
owned table columns fail startup before readiness. The process releases its
owned SQLite handle on rejection. Existing legacy finance/reward collections
remain in the same shared gateway; no shadow ledger or integration API is added.

Runtime and offline encrypted recovery explicitly register productivity snapshot
tables/semantic validation. The read-only recovery inspector validates a matching
canonical target without bootstrapping it. Semantic inspection alone does not
permit active restore: the shared promotion engine requires a configured reader.
Recovery retains task IDs, metadata, structure, ranks and pins. Existing matching
namespace/migration requirements remain; this slice does not prove restore into
an uninitialized or unmigrated target.

A new Windows package advertises `schema.domains.productivity={min:1,max:1}`.
The manifest contract accepts exactly that domain map and refuses omitted,
unknown or newer advertised versions. Legacy-only installations (domain0) remain
compatible. Actual persisted domain versions still control update/rollback bounds.
The consumer runs the compiled server/operator from the downloaded ZIP with no
checkout, install or rebuild. A CI-only synthetic fixture is produced from the
same reviewed schema/store/cutover code and is carried in the consumer harness,
never in the production ZIP. The probe exercises canonical HTTP edits, restart,
ordinary snapshot and encrypted recovery, then rejects changed checksums, newer
versions and unknown namespaces while preserving database bytes and closing
native handles. Its complete evidence is required by the release consumer gate.

P02-b2 is pending fresh review/exact-HEAD Windows acceptance. Cloud compiled
proofs are Linux only. These probes do not prove WindowsServer2019/R02 or a
canonical installation running under WinSW; the existing service gate still uses
its existing legacy fixture. No release, tag or VPS action is authorized.

FullP02 additionally needs trusted migration/rollout preparation and remaining
legacy characterization before P03. New-task append ordering from P02-b1 remains
a recorded Minor; historical P01/P02-a Minors stay deferred. No new Matrix/Kanban
UI, automatic live cutover or user-PC runner is introduced here.
