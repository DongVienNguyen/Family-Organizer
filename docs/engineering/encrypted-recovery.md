# F07-c — portable authenticated encrypted snapshot recovery

Ordinary browser/manual/auto backups remain `excluded-v1` and require offline
credential reentry. This explicit local operator mode encrypts the shared I01
snapshot, including user password hashes and structured credentials/capabilities
present in business records/public settings. It reuses collect/validate/staging/
restore/journal/migration/claim policy; it is not a second backup engine.

The envelope uses AES-256-GCM, a random12-byte nonce and16-byte tag. Its fixed
32-byte header binds format/application/version, plaintext length and nonce as AAD.
Exact framing, the256MiB snapshot bound and counted file reads reject wrong keys,
header/ciphertext/tag changes, truncation, trailing bytes and forged lengths.
No plaintext is returned until tag verification succeeds. Errors are constant codes.

The recovery key is an externally generated cryptographically random32-byte value,
represented as64 lowercase hexadecimal characters. A passphrase is not accepted.
Keep an independently recoverable copy in the operator's secure key storage, apart
from the backup and its off-host copy. This format does not rely on machine DPAPI.
The operator neither generates a key file nor embeds the supplied key in the
backup, manifest, argv, environment, logs or report. Losing the key loses recovery.

## Owned Windows operation

Run the packaged `ops/Recovery.ps1` on the operator-controlled Windows machine
with explicit `-Operation Backup` or `Restore`, release/instance roots, service ID,
port and independently trusted manifest SHA256, as for Install/Reset-Credentials.
The wrapper validates the entire package and exact owned service configuration,
requires Stopped plus an exclusive probe of closed SQLite handles, and requires
Administrator before mutation. Backup/Restore/credential reentry claim the same
protected per-instance installation marker as ReadWrite with FileShare.Read and
retain that handle through stdin, child completion and cleanup. Other ownership
reads remain possible; a second data operator is rejected before input or journal/
SQL promotion. No lock file or marker bytes are written. Validation/WhatIf acquire
no mutation scope. This is serialization of the owned data operators; online update/
SCM orchestration and process-interruption stress remain subsequent F07/R02 work. `ValidateOnly` and `WhatIf` stop before reading stdin
or changing data. Raw UTF8 JSON stdin is bounded16KiB/20seconds; the compiled Node
operator has the same boundary. Native `.ExitCode` is checked immediately.

Input has exactly `file`, `key`, `includeCredentials:true`. The selected file is a
fully qualified local path with `.fo-recovery` suffix, outside release/code/data/
config/log roots and the whole release derived from the executing packaged entry. Its existing parent must be ordinary; UNC/device/linked ancestors,
Windows device aliases, ADS and unsafe names are refused. Backup uses exclusive
creation and fsync, never overwrites an old file and never writes plaintext staging.
Only encrypted size/SHA or restored-file count/session-revocation is printed.
Do not invoke the compiled operator directly against a running application: its
shared-engine maintenance callback represents an offline operator, not the running
HTTP owner's write barrier. Windows entrypoint supplies stopped-service checks.

Restore authenticates before importing configuration or opening the target DB.
An unfinished restore journal causes RECOVERY_PENDING_RESTORE before target storage
opens. Resolve it through normal runtime recovery, stop/close again, then retry; the
operator does not collect or recover another operation's intermediate files.
It requires an existing compatible initialized target, validates the raw shared
snapshot, and uses the existing staged-media/settings + native safety-copy journal
coordinator. It preserves IDs, business rows, command metadata and claims; revokes
sessions and quarantines pending historical effects/leases. Failed authentication
never opens the target. Failed snapshot validation never promotes SQL/media/files;
normal schema bootstrap can run when opening an otherwise compatible installation.
The encrypted source is retained. Local native pre-restore safety copies follow the
existing protected installation policy; they are not off-host encrypted exports.

## Scope and evidence

This focused PR covers encrypted snapshot bytes and owned offline invocation.
Provider `.env`, nonpublic `app_settings` keys, signing/VAPID secret files and other
local configuration are not silently selected or overwritten. Explicit selected
configuration recovery, online orchestration, scheduler/retention/off-host copy,
update/write fence and rollback remain subsequent F07 work. Back up those local keys
separately under the operator's protected recovery policy until that work lands.

Tests use synthetic fixtures only. CI's clean ZIP consumer runs the bundled operator
against independent roots and retains only typed reports, never keys/plaintext
settings/snapshots. Real service probes verify active refusal, both validation modes,
wrong-key no-mutation and backup/restore with closed handles. Exact Windows results
are pending until the linked source SHA run finishes. Windows2022 does not establish
Server2019, reboot, RPO24h/RTO60m or VPS acceptance.
