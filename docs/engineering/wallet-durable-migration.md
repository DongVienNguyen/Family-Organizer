# Wallet durable migration — W02/W03 partial

Source `eb481df16ec10e9fd32ab80f1b87853ef0608ec7` adds storage4 with durable migration runs and
source links, standalone snapshot5 and explicit shared I01 registration. Storage
1/2/3 and snapshot2/3/4 remain frozen and supported at their installed versions.
Startup detects the installed version; it does not apply migration or activate
Wallet. Exact DDL/checksum and cold file-byte rejection tests cover version4.

Legacy transactions map to three shared VND accounts with zero unreconciled
openings. IDs, creators and business dates stay intact. Known creation timestamps
are canonicalized; unknown/future/impossible calendar times stay null. Invalid
money, account/currency, creator/date/kind/category/text is quarantined with a
reason and source digest; original collections remain untouched. Debt payments
and savings contributions become parent-keyed legacy_unlinked metadata, with no
second posting. Receipt references remain pending and no URL is fetched.

Source and pilot checksums bind all v3 financial tables plus durable mapping
links. A repeat creates zero new entities; changed source, financial data, mapping,
inconsistent counts or multiple pilot runs conflict. The pilot digest does not
prevent backup/restore after legitimate later canonical writes. Native posting
failure rolls back the entire run, catalog, accounts, money, audit and receipt.

The internal service requires a current administrator before source reads, after
the asynchronous safety backup and inside I01. It checks backed/current source
checksums and exact storage version. The trusted backup port must persist and read
back bytes before resolving; the existing shared validator checks those bytes.
Tests use fsync synthetic files. A compact command result retains backup ID/hash;
keyset reports page durable links, bind cursor to run/state and avoid caching
financial note bodies. There is no production backup port/route or activation yet.

Full Cloud6681tests/356files/matchingJUnit/0failed-skipped-todo; Wallet342/17files,
57new migration/service/integration cases. All6624parent cases remain. One future
sentinel title changed from a numeric version to a neutral title because4 is now
supported; it still rejects future5. Lint/build each exit0. LOCAL SELF15paths:
0Critical/1Important/0Minor, one fix pass, no rereview, not independent. The Important
finding was accepting the first of multiple pilot runs; a failing regression now
requires409. Initial native integration expectation and TypeScript failures remain
in [proof](evidence/w03-durable-migration-development.json), with final frozen hashes.

PR URL/CI run URL:none. Source-bound Cloud checks are not Windows qualification.
Current browser/Windows2022/Node22/package/service and Server2019R02 remain unrun.
No dependencies, lockfile or workflows changed. Existing Finance remains active.
Old-backup conversion (including wallet0), private receipts, quarantine remediation,
actual legacy bridge/API/UI and parity/activation are still required. Full Wallet,
M1 and master plan are incomplete. No release/tag/VPS action.
