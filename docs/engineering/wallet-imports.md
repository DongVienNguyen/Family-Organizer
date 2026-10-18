# W10 local-file imports — core Cloud checkpoint

Source `5a885a5143874f7bda7eb839e9c90c7d4980a5bc` is qualified as a core Cloud development checkpoint.
No current PR or Windows CI run exists for it. Windows 2022 and actual
Server2019/R02 acceptance remain separate. The full master plan is not complete.
Wallet activation and schema upgrades remain explicit; no startup migration,
bank connection or automatic ledger cutover is introduced.

The wizard has five steps: account/file, sheet/range, column mapping, preview and
approval, then results/history/undo. UTF8 CSV supports BOM, quoted commas/newlines
and explicit delimiters. Spreadsheet parsing supports XLS BIFF8 and XLSX, a selected
sheet and bounded ranges. Date format/locale are explicit; OFX uses its canonical
decimal grammar and stable institution/account/FITID identity. Decimal strings and
BigInt preserve signed64 amounts. Formula cells are never evaluated, macros are
rejected, and mapped formula/error cells require correction or explicit exclusion.

Limits are 20 MiB, 10,000 data rows, 256 selected columns, 64 sheets and 24-hour raw-file
staging. A header slot cannot become a 10,001st data record. ZIP inspection checks
entry count, declared aggregate size and actual streamed expansion before SheetJS
reads workbook metadata. No archive entry is extracted to disk. Preview rows are
bounded individually and in aggregate, and returned in 100-row pages.

Source file names remain metadata. Private bytes use UUID keys under
`DATA_DIR/private/wallet-imports`, outside public media/release trees. File handles,
ordinary-directory identity, symlinks, hardlinks, size/checksum and exact ownership
are checked. Failed staging removes only proven bytes created by that operation.
Explicit runtime registration uses AppJobs for durable commits and hourly expiry;
constructors/imports do not open storage, schedule jobs or contact providers.
Cleanup retires expired raw bytes and preview rows while retaining canonical
records, audit and permanent provenance. Backups include schema/preview/provenance
metadata, not ephemeral raw-file staging. Re-mapping after restore requires the
original staged bytes; a preserved approved preview remains bound to its checksum,
revision, current account/catalog access and expiry before it can be applied.

Stage/preview write no financial records. Approval queues an installation-owned
job in the same I01 command. The worker rechecks current role/account/catalog,
preview hash/revision, expiry and source keys, then applies one atomic bounded
batch using the existing record/posting/audit code. A last-row native fault rolls
back every row, manifest link and retry receipt. Shared worker lease fencing and
shutdown drain apply. Progress is coarse queued/processing/completed; the ledger
never exposes a partially applied batch. Lost replies retain an exact body/key
in the existing session command owner; there is no automatic client write retry.

OFX source keys hash target account + stable source-account namespace +FITID.
A second file with the same source record proposes a duplicate. Changed data for
the same identity is a row conflict. CSV hashes only suggest duplicates: two
identical expenses stay two records. Unresolved row errors prevent approval.

Undo is explicit: reject the whole operation if any imported record changed, or
undo only unchanged records and keep the others. It checks current account access,
record revision/source/key and financial links; unknown future record FK links are
blocked. Undo voids records without deleting history and releases only their active
import source key, permitting a corrected reimport while retaining both provenance
manifests. Manual void does not release an import identity. No debt/goal cascade.

SheetJS is pinned to the official distribution
<https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>, selected from
<https://docs.sheetjs.com/docs/getting-started/installation/nodejs/>. Version 0.20.3
has no transitive dependencies and declares Apache-2.0. The original LICENSE hash
is reviewed by the existing Windows package notice policy; original project
attribution is unchanged. Tarball SHA256:
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.

Cloud **7825 tests/435 files**, matching full JUnit, zero
failed/skipped/todo; all 7704 parent test identities plus 121
retained with multiplicity. Lint/build exit0; actual changed-lock `npm ci` and
native signed64 SQLite/dependency smoke passed. The 10,000-row synthetic fixture
checks exact ledger/provenance counts, balances, one event and integrity. Timing
observations are Cloud evidence, not a Windows performance SLA. Public timezone
formatters remain fresh while a bounded validation-only cache avoids repeated
ICU construction for each row.

Final Chromium **42/42** retains all 38 parent cases, adding CSV errors/explicit
exclusion/two identical expenses/manual-edit-safe undo/phone, unknown staging
body+key retry across navigation, two-file OFX dedupe including all-duplicate
commit, and selected Unicode XLSX sheet with money above Number precision.
The real isolated Express/SQLite fixture 10 reports integrityOK, original Finance
bytes retained, no external calls, normal stdin stop, closed handles/cleanup and
matching build hashes. Older fixture 4–9 contracts remain separately tested.

First native **40/41** failed because SSE refresh won against the queue-ack scope
await: the all-duplicate OFX batch committed 0 successfully, while the UI remained
at preview. Actual DOM/network trace are retained. A regression reproduced this;
terminal batch states now select results and the desired step is published before
the scope await. The original financial/assertion/deadline/retry checks remain.
The first source is also intermediate to actual ZIP-stream validation. A second
native 38/42 attempt exposed two clock reads producing a staging TTL longer than
24 hours by 1 ms; strict decoder/snapshot checks correctly refused it. Expiry now
derives from the single captured creation instant; an advancing-clock regression
checks the DTO and snapshot. Both failed runs retain original assertions and
artifacts. The first full 7824/435 suite passed before this native finding; the
backend clock repair and added regression required a final whole-suite run. One development-only snapshot name selection ran 1 test with
14 unselected and is not qualification; the final whole suite has zero skips.
Author inspection of 48 paths is not final independent whole-branch review.

[Proof](evidence/w10-import-development.json),
[full JUnit](evidence/w10-import-cloud.junit.xml.gz),
[full log](evidence/w10-import-cloud.log.gz),
[final browser JUnit](evidence/w10-import-browser.junit.xml),
[first failed browser JUnit](evidence/w10-import-browser-first.junit.xml),
[second failed browser JUnit](evidence/w10-import-browser-second.junit.xml).
PR URL/CI run URL:none. Backup branch:`codex/feature-first-acceptance`.
Next: W11 exports/rules, W12–18 and remaining M1/I02/I03/master, global preview
capacity hardening and protected restore/legacy bridge/cutover before activation.
Windows 2022/Node 22/package/service, other engines/touch and actual Server 2019 R02
remain unrun. No release/tag/VPS.
