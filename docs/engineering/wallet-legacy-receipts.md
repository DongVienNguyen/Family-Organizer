# Legacy receipt conversion and old-URL policy — W03/W04/W16 partial

Source `94222adfa3e17492bd02dc19c6111cdabb8bca9c` adds explicit **backup preparation**, not a live migration/apply
endpoint. The host still must enforce current administrator authority, persist and
read back a safety backup, fence source changes and own maintenance/restore before
applying the returned I01-validated replacement snapshot. Wallet stays inactive.

Conversion requires inactive Wallet5, a known active historical Admin, one pilot,
unchanged legacy source digest and a matching current pilot fingerprint. Managed
and inline images are parsed and copied into distinct private files per record;
shared old URLs never couple record permissions. New opaque IDs/audits derive
deterministically from reviewed source and bytes. Parent/actor/time/MIME/size/hash
metadata and shared media manifest are validated together. No source collection,
financial record/posting, ID, original reference or command receipt is rewritten.
No network or live filesystem/SQL mutation happens while preparing the snapshot.

Remote, missing, invalid and financially quarantined references remain explicit;
there is no fetch, guessed image or silent waiver. A mapped pending receipt can
receive an explicit validated replacement upload. Invalid/unknown replacement
choices reject the operation. The source reference/digest remains historical;
replacement provenance, hashes and current conversion time are recorded rather
than inventing an original image timestamp. A repeated source is deterministic;
a converted input adds no file/audit again. Remaining counts/status and the pilot
fingerprint are updated, while activation remains off. Financial quarantine
remediation and the live apply workflow remain pending.

After cutover, generic media authorization denies a former financial URL before
any avatar/note/staging-owner binding can allow it. A durable canonical,
Windows-case-folded path digest survives removal of legacy collection references.
Generic cleanup also preserves those protected files. Inactive pilot behavior is
unchanged. The new private record endpoints remain the authorized way to obtain
receipt bytes; the legacy read/write adapter still needs wiring before cutover.

Wallet5 snapshot validation checks conversion anchors against the correct record,
receipt ID and hash, rejects unsupported conversion versions/invalid deny digests,
and permits explicitly detached history only with valid actor/time and no live
manifest row. Canonical detach retains the old deny marker and unserved bytes;
the next shared backup still validates and restores. Audit now records the true
before/after record revisions and hashes rather than raw filenames or image data.
File retention/privacy erasure remains a separate unfinished policy.

Cloud7130tests/383files/matchingJUnit, zero failed/skipped/todo; all7096parent
retained+34 (9policy,23conversion/integration,1HTTP,1audit). Lint/build exit0;
Chromium14/14 retains all prior cases, real Express/SQLite, integrityOK, legacy
kept, normal stop and zero external attempts. Final build bytes match the tested
build. RED cases and failed development reports remain, including a corrected
historical-binding fixture and a controlled reproduction proving old cleanup
removed the file without the new guard. TypeScript inferred-map types were fixed
before final validation; no test/assertion/timeout/retry standard was relaxed.

[Proof](evidence/w03-legacy-receipts-development.json),
[full compressed JUnit](evidence/w03-legacy-receipts-cloud.junit.xml.gz) and
[browser cases](evidence/w03-legacy-receipts-browser.junit.xml) retain evidence.
Author inspection9paths is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance`. Current Windows2022/Node22, other
engines/touch, package/service and actual Server2019R02 are unrun. No dependency,
lock, workflow, release/tag or VPS access/deployment change.

Next: complete live safety-backup/maintenance apply and financial remediation,
raw JSON/ZIP conversion and the legacy bridge/cutover. Remaining filters/bulk,
retention, other Wallet/M1/I02/I03/master gates stay mandatory. This checkpoint
does not complete W03/W04/W16, activate Wallet or complete the overall plan.
