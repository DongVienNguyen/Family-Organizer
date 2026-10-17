# Clone and exact category splits — W07 partial

Source `26c7e39fb695d2299efd7291206caa84da6456f7` adds draft-only clone and exact split creation/editing.
Wallet remains off by default. No automatic schema upgrade, activation, dependency,
lockfile, workflow, release/tag or VPS action is introduced. Template commands/UI
and aggregate reports are still unimplemented; this is not full W07/master acceptance.

Clone uses a current full-record ACL query. It preserves exact money, default
labels, a historical rounded FX quote, fee and allocations, but creates a new
local date/time with uncleared/unreviewed defaults. It returns no original record
ID/source key/occurrence/creator/revision and performs no ledger/audit/nonce write.
New assignments to archived accounts, hidden/archived categories or labels refuse.
The form remains a new draft until explicit Save creates a fresh manual record.
Its optional FX/instant seeds preserve precision and overlap until input changes.
Later source/fee grant loss retires an open cloned draft through real SSE refresh.
Late read responses cannot resurrect it after generation or session changes.

Split rows contain distinct category IDs and positive signed64 minor strings.
Up to100 rows must sum exactly, using BigInt, to one income/expense posting.
Empty rows restore the ordinary record category. Existing hidden/archive history
is retained, while new assignments follow inherited category visibility. Current
writer/creator/account ACL, expected revision and I01 nonce govern replacement;
no-op rows do not bump revision/audit or notify, and replay returns the original
acknowledgement. The posting amount/count remain unchanged for split-only edits.
Create/update/clone can write amount and rows atomically; a native fault on the
second row rolls back the entire record/posting/metadata/audit/nonce for retry.

The session owner provides one record/split editor, retained exact input locale,
inline validation, original stale draft and explicit reload. An unknown split
keeps its original payload/key across navigation and blocks replacement/discard.
Revalidation clears public rows/forms synchronously; manifests must match the
selected record/revision and total before entering the view. The shared editor
uses FancySelect, exact locale text, modal focus/scroll ownership and vi/en/zh.
Clone defaults are explained in the new form; Save is the financial action.

One shared query/selection path matches allocation children and their ancestors
without duplicating the parent record or adding an unrelated parent category.
Search includes readable allocated-category names. Index category IDs remain
internal, partial/private associations are withheld and cursor fences detect
changes. W08 aggregate series/totals/coverage/drilldown remain separate work.

Explicit storage7/standalone8 adds owned-template storage and strict allocation
validation. Its checksum is `4d625d4525c212af601d2e43ed13ab52a96c283e01e5315c088ee80af2ede3ed`. Accepted1–6 DDL/checksum bytes
remain unchanged. Older backup contracts retain their recorded bytes, including
historical inconsistent splits; an explicit7 upgrade refuses those splits without
repair. The default startup still preserves an installed older version. Template
CRUD/instantiate/UI will use the new table in the next W07 step. Default4,
receipt5 and bulk6 fixtures remain distinct; the browser opts into workflow7.
Existing baseline fixtures now explicitly prepare up to6 instead of following
the latest registry, preserving their original schema assertions.

Cloud **7531 tests/414 files**, matching full JUnit,
zero failed/skipped/todo; all7426 parent identities plus105
new cases retained. Lint/build exit0. Chromium **28/28** retains all23 parent cases
plus clone, later grant revocation, exact split/filter, unknown same-key replay and
atomic split clone. Isolated real Express/SQLite reports integrityOK, original
Finance retained, normal stop/closed handles, zero external calls and matching
build bytes. This is Cloud evidence; current Windows acceptance is unrun.

The first browser run was26/27: DOM/trace showed the last synthetic source outside
the first50 of68 loaded rows, before any split action. New-case setup now filters
the synthetic source before selecting it. All assertions, selectors, default45s
case deadline and retry policy remain. A rollback fixture initially expected0
audits despite3 existing account-creation audits; its correction compares complete
before/after rows, including those retained audits. RED/targeted/lint/first-browser
logs are hash-indexed; no test/assertion was removed or skipped to obtain green.

[Proof](evidence/w07-record-workflows-development.json),
[full JUnit](evidence/w07-record-workflows-cloud.junit.xml.gz),
[full Cloud log](evidence/w07-record-workflows-cloud.log.gz),
[browser JUnit](evidence/w07-record-workflows-browser.junit.xml),
[first failed browser JUnit](evidence/w07-record-workflows-browser-first.junit.xml).
After all28 browser cases first passed, the native cleanup still expected6,
so that wrapper attempt failed before its legacy hash check. It is retained and
is not acceptance. Cleanup now compares the installed version to the verified
seed version7; final28 reruns mandatory integrity/legacy/shutdown checks. Only that
runner file changed after the7531 full suite: all application, unit-test, seed,
build and lock bytes remain identical. The proof retains both source manifests
and an explicit qualificationScopes mapping, plus current Node syntax evidence.
No unchanged full unit/build rerun was needed for that isolated runner repair.
The proof binds every frozen source/test path to committed Git blobs and indexes
raw reports plus preserved browser DOM/trace/screenshot artifacts. Author inspection
is not the final independent whole-branch review.

PR URL/CI run URL:none; backup branch `codex/feature-first-acceptance`. Current
Windows2022/Node22, other engines/native touch, large performance/package/service
and actual Server2019R02 remain unrun. Next are owned templates/UI, aggregate
reports, protected restore host/Admin binding, financial remediation/raw legacy
backup/bridge/cutover/retention, remaining Wallet/M1/I02/I03/master and final review/
batched Windows. Win2022 cannot certify Server2019; full plan remains incomplete.
