# Guarded receipt restore service — W03/W04 partial

Source `1ea64971b0c7ea602f6f904ec10358c36d607dbd` adds a trusted prepare/apply service using the existing shared
restore coordinator. It does not add a production route, backup encryption/key
configuration, Admin UI/operator binding, migration startup or Wallet activation.
The native tests bind real persisted synthetic private backup files and the real
SQLite/file restore engine. Production host binding remains mandatory before
this becomes an operator workflow; the user's PC is not a required runner.

Preparation requires a current undeleted Admin, an inactive supported receipt
schema with trusted cold inspection, and a host backup port that persists/fsyncs/
reads back a full private safety snapshot before returning. Ordinary backups with
excluded credentials are refused to avoid replacing current credential data.
The source is shared-validated, checked against live state and converted without
fetching media. Preview returns opaque backup identity, original/target checksums,
conversion time/run, data/file fingerprints and copied/pending counts. A confirmed
apply reads the persisted bytes again and validates every binding and replacement.
Unresolved remote/missing media stays explicit; valid supplied replacements can
resolve it, and activation remains off. New no-op apply attempts refuse without
restoring the entire app merely to report unchanged/pending work.

The database fingerprint covers full legacy data and canonical table rows,
including unrelated Tasks and every financial/write nonce. Signed64 Wallet money
is selected as text. SQL row/key order is normalized; only strict read-only
snapshot capture receipts are excluded, so preview/backup reads do not themselves
invalidate a confirmation. Media bytes and public settings have a separate
fingerprint; the existing shared engine preserves local private provider settings.
No caller SQL identifiers bypass the shared validator/identifier check.

The coordinator now accepts an optional trusted synchronous assertCurrent guard.
It runs on cached replay, after maintenance drain, after native safety-copy fsync
before any file promotion, and within the one I01 transaction before deleting or
replacing rows. Crucially the atomic guard sees original live SQL/legacy, rather
than the historical replacement document which may still contain an Admin role.
Its get/all methods enforce SQLite readonly statements and close when the call
returns. Async/thenable guards are refused and late rejection is consumed.
Existing callers without a guard retain their restore behavior.

The service rechecks current Admin, trusted inactive version and the whole data
fingerprint at each write boundary; file identity is checked before promotion.
Concurrent work or demotion after backup, during safety copy or after staging
refuses and rolls back media/settings/SQL/cache through the existing journal.
A newer unrelated Task cannot be overwritten by an otherwise valid receipt copy.
The original I01 lease assertion is preserved in the cloned async command context;
an expired owner cannot commit. No second connection, writer or file transaction
protocol is introduced. Money/postings/record/source/legacy receipt URLs remain.

Nonce identity binds the original prepared backup/run/time/checksums and validated
replacement filename/MIME/size/content digest. Only a current Admin can replay the
original compact acknowledgement after a lost reply, even if source state later
changed or cutover occurred. A changed request conflicts; replay performs no new
backup/restore and returns no financial body. The service reports the original
shared-restore session-revocation policy, so the eventual host UI/operator must
explicitly require users to log in again. New applications still require inactivity.
Caller input/context mutations across awaited reads cannot retarget the operation.

Native regressions cover corrupt/ordinary/swapped backups, changed money/Tasks/
settings/media/role/deletion/activation, all guard boundaries, SQL/file rollback,
same-key retry and lost acknowledgement, lease loss, request-owner mismatch,
replacements without fetch, cached authority, no-op refusal, readonly/expired read
handles, async rejection and cold pure imports. A TypeScript fixture's inferred
UUID literal type was corrected to the actual CommandContext string contract;
its mutation assertions remain. No assertions, skips, retries or deadlines were
relaxed.

Cloud7354tests/399files/matchingJUnit,0failed/skipped/todo,
all7296parent cases retained+58. Lint/build0; Chromium19/19
preserves all prior journeys on explicit synthetic schema6, integrityOK, original
legacy data, normal stop/closed handles and zero external attempts. Current build
bytes match the run. Those browser cases preserve existing workflows; they do not
qualify the unimplemented new Admin service UI/operator. Full regression/build/
browser ran once for the final unchanged source.

[Proof](evidence/w03-receipt-restore-development.json),
[full JUnit](evidence/w03-receipt-restore-cloud.junit.xml.gz),
[full log](evidence/w03-receipt-restore-cloud.log.gz),
[browser cases](evidence/w03-receipt-restore-browser.junit.xml).
Author7path inspection is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance`. Current Windows2022/Node22, other
engines/native touch, performance/package/service and actual Server2019R02 remain
unrun. No dependency/lock/workflow/release/tag/VPS action occurred.

Continue catalog/label workflows alongside protected host backup/maintenance/Admin
binding, financial remediation,
raw legacy JSON/ZIP, canonical legacy bridge/cutover/retention, saved preferences
and other Wallet/M1/I02/I03/master work before final branch review and batched
Windows qualification. This service checkpoint does not complete W03/W04/I01
acceptance or the full plan. Wallet remains off by default.
