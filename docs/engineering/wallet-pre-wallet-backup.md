# Pre-Wallet shared backup conversion — W03 partial

Source `cdb2e48b38e2bf3eb38261eb33553969835af386` converts a shared manifest with
wallet0 into Wallet4. It uses the same pure staging rules as live migration,
without another writer or database. An explicit known active historical Admin
owner and timezone are required. Reviewed source/owner/timezone/clock generate
stable UUIDv8 staging IDs; original transaction IDs remain unchanged.

Historical source inspection requires no native Wallet tables/migrations and
retains the exact versions of all other namespaces. Inspection never brands source
bytes as restoreable. The complete target must pass I01 before the existing
restore/maintenance owner can apply it. No SQL/files/provider runs in staging.

Three shared VND zero-opening unreconciled accounts, provenance, quarantine and
legacy_unlinked debt/savings metadata follow the existing migration rules. No
second posting is created for child payments. Receipts stay explicitly pending
without fetch. All original legacy collections, command UUID receipts, settings
and media remain intact. Converted Wallet stays off. Restoring the target then
running live migration against restored source creates0, keeping the same run.

A fresh migration now rejects unowned orphan links instead of erasing them.
Malformed hidden-category source returns400 before any SQL. Native failures still
roll back staging application, audit, receipts and original legacy together.

Cloud6726tests/358files/matchingJUnit/0failed-skipped-todo, Wallet387/19;
all6716parent+10. Lint/build0. LOCAL SELF8paths0C/1I/0M, orphan-link finding fixed
RED→GREEN/full, one fix pass/no rereview/not independent. Initial conversion3RED
and integrity3RED, final frozen hashes/reports are in
[proof](evidence/w03-pre-wallet-backup-development.json).

PR/CI run URL:none. No route/activation or automatic conversion is wired. Raw
legacy JSON/ZIP without shared namespaces/claims needs a coordinated converter;
the old legacySnapshot gate remains unchanged. Private receipt conversion/ACL,
remediation, real legacy bridge/API/UI, parity and all remaining Wallet/M1/master
work are still required. Current browser/Windows2022/Node22/package/service and
actual Server2019R02 remain unrun. No dependency/lockfile/workflow, release/tag/VPS.
