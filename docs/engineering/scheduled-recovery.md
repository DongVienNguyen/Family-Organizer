# Owned scheduled encrypted recovery

F07-h is opt-in. Missing CONFIG_DIR/recovery-backup.json disables the new schedule.
A strict format1 enabled configuration declares includeCredentials:true, independent
settings/file/env selections, a dedicated backupRoot outside storage/release roots,
and the fixed CONFIG_DIR/recovery-backup.key. The key is exactly32 ordinary binary
bytes, outside backup and immutable release. Keep its original recovery copy safely
outside this installation; no generated replacement or DPAPI-only portability claim.

Configure-Backup.ps1 uses the existing trusted manifest, owned stopped service,
Administrator and exclusive operation guard. ValidateOnly/WhatIf return before
confidential stdin or mutation. Enable accepts bounded UTF8 JSON with key64 lowercase
hex and explicit selections; Disable requires no key input. Key/config receive
protected Administrator/SYSTEM plus the specific service SID read-only DACL; the
external backups directory grants that SID modify. An existing key must match,
otherwise configuration fails without changing it. Missing key with existing
ciphertext is refused. Complete retained first-use keys allow same-key retry; a
partial key is invalid and never silently replaced. No key is sent in arguments,
environment, reports, logs or package. Native/npm commands use immediate exit checks.

One AppJobs namespace/type owns boot and12-hour buckets aligned to the product's
UTC+7 timezone. Public configuration identity plus the local restore marker prevents
a restored installation inheriting a completed source bucket. Durable leases/draining
and the shared online I01 collector/AEAD/restore remain. Fresh UUID output names are
exclusive and fsynced; retry can retain an additional authenticated snapshot and does
not overwrite older ciphertext, replay points/payments or create a second engine.

Successful capture persists completion timestamp, ciphertext SHA256, filename and
size; job payload/cache/state contain no key or private snapshot. Admin-only existing
server stats add redacted backup health. Age is based on successful completion:
24hours is stale; negative/backward clocks are invalid. Latest output must exist as
an ordinary single-link file with the recorded size. Health stat checks do not
certify AEAD integrity; restore evidence validates authenticity/contents separately.
ENOSPC/EDQUOT/SQLITE_FULL produce a safe storage-full code and diskFull flag. Failed capture keeps
prior success evidence. A format2 redacted status persists the last safe failure alongside the prior receipt; format1 receipts remain readable. Restore occurrence identity uses installation-local commit row order, independent of wall-clock correction. Reinstall reseals specialized key/config read ACLs and backup output modify ACLs. Matching existing keys have their reader grants resealed without replacing bytes. Malformed optional setup does not disable legacy functionality
or claim backups are working.

Evidence:29 config/key/age,10 durable schedule,4 startup,3 missing/sized/linked output,
1 ENOSPC,1 restored-bucket,3 missing-suite and3 package-exclusion actual REDs followed
by green checks. Full Cloud1661/94/lint/build0 with2workers, no required skipped tests.
Actual PowerShell5.1 and WinSW LocalService schedule/config/ACL/restore run on the
Windows Actions runner, and must be verified at exact HEAD before merge. The service
probe preserves a canonical17-point grant/claim and business IDs, source ciphertext,
key and session-revocation policy through the existing offline restore.

Retention and off-host encrypted copy, guarded update/rollback, F08/F09 and enforced
main protection remain separate. Server2019/reboot/power-loss/RPO24h/RTO60m are R02
acceptance work. No release/tag/VPS or new domain feature is performed here.

Review correction: five Important and one Minor findings were graded together before one correction pass. Five actual diagnostic RED assertions cover native SQLite-full capture, schedule capture/receipt, terminal restart health and actual runtime restore-marker ordering. One earlier restore-marker fixture failed schema bootstrap and is retained as a harness failure, not a product RED. Windows regressions add extra-reader/missing-service-read resealing and configure → reinstall → LocalService capture. The initial Windows run failed on the second Enable at config-publish; explicit public backup filename removes ambiguity from PowerShell 5.1 null-string binding at File.Replace (exact native cause still subject to corrected CI), followed by resealing/verification. Native corrected evidence remains pending.

Corrected Cloud:1666/1666 tests across94files, zero failed/pending/todo; lint/build exit0; targeted33/33. All six review findings addressed in one correction pass. Corrected Windows evidence required before merge.

CI38256696436 verified native repeated configuration, existing reader resealing and reinstall ACLs. Its remaining failures were test harness setup ordering on Node22 and a15-byte slice of16-byte magic. Both corrected without removing assertions; target5/5 on both pinned Cloud runtimes. Native active capture/restore/full-HEAD acceptance still requires the subsequent Windows run.

Restore comparisons use complete parsed canonical values, preserving every ID/sequence/type/value. Shared snapshot validation sorts object keys, so raw serialized JSON property order is not a data-loss criterion. Capture-time expected rows precede intentional later writes. The scheduled Cloud case now closes the runtime, invokes the real offline shared operator and checks all six canonical tables/ciphertext; target5/5 on both pinned runtimes. CI38257798150 executed native capture/health and restore exit0 but failed the raw-JSON oracle; subsequent exact Windows acceptance is still required.
