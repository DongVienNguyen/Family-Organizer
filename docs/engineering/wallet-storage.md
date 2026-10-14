# W02-a Wallet storage pilot

This slice supplies trusted internal repositories and an explicit pilot DDL.
The existing I01 gateway owns the connection, synchronous transaction,
idempotency and legacy mutation tracking. Wallet opens no separate writer.
Transactions reject asynchronous/nested use; all native calls are bound to the
gateway lifetime. A second posting failure rolls back record, audit and legacy
changes together.

Money persists as SQLite INTEGER bound through BigInt, with signed64 limits.
Reads cast money to TEXT, preserving exact values beyond JavaScript's safe
integer range. Account/date/record indexing, composite posting-date references,
source/external-key uniqueness and linked-occurrence uniqueness are enforced.
No financial command or role permission is granted by these trusted repositories.

WalletSnapshot protocol2 covers the twelve pilot tables, exact money strings,
columns, primary keys, references and checksum. Export requires the I01 marked
read-result port, keeping complete snapshot bytes out of command caches.
Restore validates before writing and uses the caller's single I01 transaction;
category foreign keys are deferred so child ID order cannot invalidate a valid
restore. Synthetic tests exercise signed64 boundaries, rollback, duplicate
references, malformed/future snapshots and legacy-save preservation.

This is a partial storage slice. Remaining entity/spec fields, shared AppSnapshot
registration, startup compatibility, compiled offline restore, migration and
activation are not implemented here. Standalone WalletSnapshot is not a complete
application backup. Runtime deliberately continues refusing unregistered Wallet
tables; do not run this pilot DDL against a production installation. W02-b owns
the shared registration and compatibility before any persisted Wallet restart
claim, and the remaining W02 schema work must precede full W02 acceptance.
W03–W05 own legacy finance migration, account ACL and financial commands.

No runtime call site invokes this DDL or enables Wallet. No new HTTP route, UI,
dependency or production data is part of W02-a. Imports of schema/store/snapshot
must be cold. Windows2022 CI checks both supported Node runtimes and all existing
browser/service/package proofs; actual Server2019 acceptance remains R02.
