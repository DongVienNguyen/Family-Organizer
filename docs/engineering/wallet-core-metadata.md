# Wallet core metadata — W02 partial

Source `43e9cdb04f6adb58d10b9714d39a3251a04aad8b` adds five 1:1 metadata tables
for accounts, records, categories, labels and audit. Typed repositories validate
known historical users, UTC timestamps, chronology, flags and exact signed64
credit limits. Backfill retains IDs/money and leaves unknown time/actors NULL.
Existing canonical inserts create empty metadata after explicit upgrade; future
live commands must supply their authenticated actor and clock.

Migration1 SQL/checksum is unchanged. Migration2 is registered only for an explicit
pilot or an already installed domain2, never automatically applied at startup.
Its checksum is `4692c682ac0f19185de4a85bb02d9ca667441d4b355cbd6b10d446b1e332dcea`.
The new parent/category index is part of that frozen migration.

Standalone protocol2 still describes migration1. Protocol3 includes migration2
metadata; shared I01 keeps envelope1 and Wallet domain2. Restore requires the same
installed domain version. Cross-version upgrades require the future W03 converter;
this change does not silently discard new fields to accept old backups. This
version split is a deliberate change from the original plan's single protocol2.

Snapshot producers reject partial or unknown Wallet schemas and incomplete or
invalid metadata. Consumers check coverage, references, actors, money and JSON
before writes; I01 rejects invalid data before maintenance. Nullable registered
integer fields stay NULL through shared restore. No parallel writer, DB connection,
media coordinator, HTTP route, activation or financial UI was introduced.

Cloud validation: 6425 tests/345 files, matching6425 JUnit cases, zero failed,
skipped or todo; lint/build exit0. All6379 previous case identities remain+46.
Wallet targeted86/6files includes cold startup refusing changed money affinity,
FK, CHECK and index definitions with unchanged database bytes and closed handles.
One LOCAL SELF review covers13 paths, 0Critical/0Important/0Minor; it is not an
independent review. Development failures are retained in the compact proof.

See [evidence](evidence/w02-core-metadata-development.json) for hashes, commands,
report names and raw Cloud paths. Unit/JUnit reports bind the frozen working-tree
bytes subsequently committed as this source, not an exact-HEAD Windows run.
No PR or CI run was created. Backend-only work needed no new browser run. Current
Windows2022 Node24/Node22, package/service and Server2019R02 are unrun.

W02 remains incomplete: full remaining entities, import references and private
attachment manifests still need implementation. W03 migration/quarantine/backup
conversion, W04 authorized live routes/media and W05 commands/UI remain pending.
Historical reference validation does not grant live financial access. Legacy
finance stays active. Final M1/Wallet/master acceptance is not claimed.
