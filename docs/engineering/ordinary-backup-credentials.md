# F07-b: ordinary backup credentials

Ordinary JSON and ZIP backups use I01's existing shared snapshot engine. They retain
canonical user/task/finance/reward/media IDs, reward claims, migrations, command
nonce tombstones and business results. A `credentials: excluded-v1` manifest marks
the projection; checksums cover the projected bytes. Export does not change the
live installation. This is a business-data backup, not a portable credential archive.

The projection removes structured password/hash/key/token fields, cached response
credentials, URL userinfo and known credential query parameters, browser push
subscriptions, push-delivery endpoints and worker lease tokens. Structured
`homelabLinks` are sanitized; malformed or primitive values are omitted. Arbitrary
free-text notes, attachments and business content are preserved: operators must
avoid placing passwords in that content. Provider settings and the session key
already stay outside ordinary backups; local provider credentials are retained by
restore, never replaced by uploaded credentials.

Only credential/push command payload verifiers are replaced with stable non-secret
`excluded-v1` tombstones. Retrying a pre-restore credential request ID must return
conflict; use a fresh request ID after explicit credential reentry. Financial/reward
command verifiers and claim IDs remain unchanged. Push job IDs/dedupe keys remain,
but their capabilities are removed; the shared restore policy quarantines pending
effects and does not replay old push deliveries.

All public ordinary restore paths apply this policy even to historical format1
ZIP and legacy JSON inputs. Restored users have the same IDs and roles and no
password hash. Old sessions are revoked; logging in with the old password fails.
No replacement administrator, demo data or public password-reset endpoint is added.

## Reenter missing passwords

Stop the owned service and wait for `Stopped` and native SQLite handles to close.
From the trusted extracted Windows package, run `ops/Reset-Credentials.ps1` with
`ReleaseRoot`, `InstanceRoot`, `ServiceId`, `Port` and an independently trusted
`ExpectedManifestSha256`. `-ValidateOnly` and `-WhatIf` validate ownership, package
bytes, stopped state and closed database without reading confidential input or
changing data. A running or foreign service is refused.

For an actual change, an elevated local operator provides UTF8 JSON on stdin:
`{"users":[{"id":"<existing user ID>","password":"<new passphrase>"}]}`.
Read confidential input locally; do not put actual passwords in shell arguments,
environment variables, saved JSON files or transcripts. Close stdin after the JSON.
Input is limited to16KiB and20seconds; at most32 distinct existing active users can
be selected. Each passphrase needs16 non-whitespace characters and at most4096 UTF8
bytes. IDs, names, roles and business data cannot be changed by this command.
Only missing/empty password hashes are eligible. Unknown/deleted users, duplicates,
existing hashes, weak passwords or extra fields reject the entire batch. New hashes
and session revocations commit together through the existing AppStore transaction.
Command-cache verifiers use salted hashes. Success prints only user IDs and the
session-revocation indicator; no password or password hash is printed.

The compiled equivalent is `bin/node.exe app/dist/operator.cjs --reset-credentials`
with production storage roots selected and the application stopped. The service
wrapper additionally checks the trusted package, owned service and file locks;
prefer it for installed Windows services. Re-register browser push subscriptions
and enter provider credentials locally where needed.

## Evidence and remaining F07 work

Synthetic regressions cover ZIP/manual/automatic JSON exclusion, historical restore,
structured secrets, cache verifiers, atomic reentry, ID/role preservation and HTTP
session/conflict semantics. The independent Windows ZIP consumer must prove old
login failure, compiled offline reentry, finance/reward preservation and unchanged
command/claim/migration rows. The disposable service job must also exercise the
PowerShell wrapper under Windows PowerShell5.1 with Unicode paths, active-service
refusal, ValidateOnly/WhatIf, invalid-batch rollback and valid reentry.

Exact-HEAD Windows results are pending for this branch; source/tests alone are not
Windows evidence. Encrypted authenticated portable recovery archives, backup
scheduling/retention/off-host copies and update/rollback orchestration remain later
F07 tasks. Local pre-restore SQLite safety copies may contain credentials; keep them
under the protected instance ACL and never upload them as Actions artifacts.
Windows Server2019, actual reboot and measured RPO/RTO remain R02. No release, tag
or VPS access/deployment is authorized or performed.
