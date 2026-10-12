# Owned Windows update and rollback

F07-k consumes the F07-j startup fence and the existing I01 encrypted recovery
operator. It does not publish a release or deploy to a machine. Windows2022
synthetic proofs must be read at the exact PR HEAD; Server2019/reboot/power-loss
acceptance remains R02. Actual off-host independence and RPO/RTO are unmeasured.

The elevated authenticated `Update.ps1`/`Rollback.ps1` operator validates both
complete release manifests, official Node/WinSW pins, canonical service ownership,
physical roots and protected ancestor permissions. Release directories are distinct
and retained. `ValidateOnly`/`WhatIf` performs verification before reading the
private key, stopping the service or changing files/ACLs. All npm/native commands
and child operator processes check their exit code immediately.

Update requires the existing portable32-byte `config/recovery-backup.key` and an
owned backup directory, configured by `Configure-Backup.ps1`. Keep the original
recovery key outside the ciphertext and on an independently recoverable medium.
The native operator reads that private protected key; it accepts no secret command
line or environment input. Backup explicitly includes credentials, Gemini/Telegram
settings, session signing key and Gemini/VAPID environment selections. No provider
or notification is invoked by the offline recovery engine.

The existing installation metadata handle is the shared operation guard. Recovery,
credential/maintenance operators and install/uninstall/update contend for it. After
stopping and draining SCM, the operator proves exclusive SQLite handles closed,
checks the actual stored schema/integrity/users without bootstrap writes and takes
a fresh authenticated encrypted I01 snapshot. This captures business writes
accepted immediately before the stop. It never copies a live DB while omitting WAL.

Completed exact apply/rollback requests verify the current owner, journal, approval
and I01 boundary and return idempotent success without a new snapshot or data write.

A fixed public-state `service/update-journal.json`, protected for Administrator and
SYSTEM, is separate from SQLite. Counted ordinary-file reads check identity, link
count, stable metadata and ancestors. Journal transitions use expected-SHA CAS,
exclusive staging, fsync and atomic NTFS publication. The native guard serializes
operators; CAS alone is not an independent concurrency lock. Unknown/malformed/
linked/oversized journals refuse before resetting anything. A bounded history
retains prior completed operations; history/size exhaustion refuses another update,
never drops earlier latches or snapshots automatically.

The operator publishes candidate `held` control, canonical XML and ownership
metadata while stopped, then starts the candidate. The service stays Starting:
health is observable, readiness/business requests503 and AppJobs have not started.
Native health/version plus actual SQLite/core/domain smoke precede a durable
journal `opening` latch. Only after that flush does the operator publish `approve`.
Runtime commits its I01 metadata and command record before Ready/jobs. Journal,
approval control, DB opened metadata and command history are independent evidence;
a DB restore cannot erase the external journal/approval latch.

On a candidate failure, an automatic snapshot rollback is attempted only with a
matching held control, known journal `writesMayOpen:false`, no DB opened metadata
and no matching I01 command. The retained ciphertext must match its exact receipt.
Restore uses the shared I01 staging/validation/coordinator, revokes sessions and
retains source legacy bytes, claims and private selections. Old binary startup is
also held and smoke-tested; its reopening latch is flushed before approval.

After possible opening, snapshot rollback refuses and preserves data. Explicit
binary rollback checks the actual persisted versions against the old manifest and
keeps business writes. A fresh rollback startup UUID avoids reusing a candidate
marker with a different manifest; the original operation and conservative latch
remain in the external journal. Incompatible downgrade never resets versions.
Full restore after writes requires separate explicit operator recovery and delta
reconciliation; automatic update/rollback does not offer that override.

XML publication uses a staged file and native `File.Replace` with an explicit old
filename, compatible with Desktop PowerShell5.1. The already-open metadata guard
writes/flushes its descriptor in place. An interruption can leave a partial
ownership descriptor or a nonterminal journal; that state is deliberately unusable
and requires operator recovery with independently trusted old/candidate manifests.
Both release directories, encrypted snapshot and journal remain. This is no claim
of automatic crash recovery or atomic power-loss acceptance.

The disposable fixture copies the exact tested ZIP bytes to a distinct directory;
this proves native path/configuration switching with the current binary, not a
published different-version upgrade. It injects an owned loopback port conflict,
checks preapproval recovery retains a fresh finance write, tests postapproval
snapshot refusal and incompatible schema refusal, and proves compatible binary
rollback retains a later finance write. Reports contain public IDs/digests/exit
codes, never the recovery key, credentials, token or raw business rows.
