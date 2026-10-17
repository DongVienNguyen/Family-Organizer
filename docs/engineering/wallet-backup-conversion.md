# Explicit native Wallet backup conversion — W03 partial

Source `cccffdceafdc8bf5e5cc82e587c84d2f7cc5d5af` adds standalone2/3/4→5 conversion
and native Wallet1/2/3→4 conversion within the shared manifest. Source and full
converted target are validated before any write, staging or maintenance. Other
namespace versions remain exact; this is not a general downgrade/upgrade bypass.

I01 historical inspection uses an additive subset of currently installed trusted
tables and checksum prefix. Its result is not admitted to restore. The ordinary
restore gate remains version-exact; only a converted target that passes the full
current validator can enter the existing coordinator.

Money remains exact signed64 strings. Known provenance, IDs/revisions, FX/fees,
labels, allocations, occurrences, audit, command receipts, legacy, settings and
media remain intact. Missing historical metadata stays null/default. Missing old
crosscurrency quotes are rejected rather than inferred. Conversion is deterministic
for an explicit clock and retains original/result checksums in a separate receipt.
Old native conversions always set wallet_active=0 for parity review; current4 is
an unchanged no-op. No route/runtime activation or automatic conversion is wired.

Full Cloud6716tests/358files/matchingJUnit/0failed-skipped-todo, Wallet377/19;
35targeted conversion cases, all6681parent retained. Lint/build0. LOCAL SELF4paths
0C/0I/0M, no correction/rereview, not independent. Initial missing module and then
missing shared converter/inspector RED5 are retained in
[proof](evidence/w03-native-backup-conversion-development.json).

PR/CI run URL:none. Current browser/Windows/Node22/package/service and Server2019R02
unrun. No dependency/lockfile/workflow change. Shared pre-Wallet0 and raw legacy
JSON/ZIP need explicit coordinated conversion; private receipts, remediation,
legacy bridge/API/UI, parity and all later tasks remain required. Full Wallet/M1/
master incomplete. No release/tag/VPS access or deployment.

Later continuation: shared pre-Wallet0 conversion is now implemented at sourcecdb2e48; see [pre-Wallet proof](wallet-pre-wallet-backup.md). The source-specific native1/2/3 evidence above remains historical. Raw legacy JSON/ZIP without the shared manifest is still separate.
