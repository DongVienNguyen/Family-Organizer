# Shared online encrypted recovery capture

F07-g adds `runtime.backupRecovery(request)` as an internal local port. It borrows
its owning runtime's SQLite connection and returns the same encrypted success
metadata as offline recovery. It does not add an HTTP route. Local orchestration
can await the compiled CLI's exported `application` promise for the existing owner;
normal service startup/signals/stdin stop remain unchanged.

The existing I01 collector runs synchronously inside the native SQLite IMMEDIATE
transaction, reading committed WAL rows, registered module tables, settings and
immutable media bytes/manifest. Explicit private settings/signing/provider selections
are captured in that same callback. No async continuation can read half of a JS-owned
settings/media write; another native SQLite writer cannot enter during IMMEDIATE.
This is the shared logical snapshot format consumed by the existing restore engine.
Native `.backup()`/WAL binary compatibility remains separately tested by the required
SQLite probe; online logical capture introduces no second binary restore format.

Strict input/selection/path/size checks, external32-byte key, AEAD, exclusive output,
fsync and partial-output cleanup are shared with the offline operator. The latter
owns/closes its connection; the online port never closes the runtime owner. Successful
and rejected captures preserve canonical IDs/claims/business rows and allow later
service writes. A read-command tombstone stores no plaintext snapshot/secret values.

The runtime registers each in-flight backup with its existing effect drain. It checks
ready before accepting a call and again before capture after imports. Shutdown and
maintenance fence pending capture; owned SQLite closes only after pending work drains.
Rejected backup does not make an otherwise ready service fail. Captured auth sessions
are still revoked by restore; historical effects/leases remain quarantined.

Evidence:6 actual absent-port REDs/1 missing-suite RED;139 targeted cases; full Cloud
1606/91/lint/build0. Compiled diagnostic14 existing functional +8 online checks/3 nested
phases0 includes live WAL, secret encryption, failure/prior-output retention, denied
write, concurrency, later HTTP writes, shutdown, point-in-time restore and closed
handles. Cloud POSIX refusal is not Windows DACL proof; exact-HEAD Windows ZIP consumer
must run all8 checks with a real denied directory. Its producer/consumer/owned-service
baseline checks remain mandatory. Synthetic input only; no provider calls.

This port is preparation for a single AppJobs scheduling owner. No backup schedule,
age/retention/offhost copy, guarded update/rollback or RPO/RTO claim is made here.
Those remain later focused F07 PRs. Real LocalService scheduled capture and actual
Server2019/reboot acceptance remain separate. No release/tag/VPS operation is run.

Wholebranch review found a launch-path protection defect: the old complete-release
boundary was recognized only through operator.cjs argv. Online server/orchestration
now derive that boundary from the actual loaded bundle directory; the offline guard
is retained. An actual compiled regression first accepted release-root/bin/ops
outputs and now refuses all3 without writing. The review also identified a missing
overlap-writer acceptance check, regraded as a required coverage gap. Added TS rows/
settings/media generation consistency plus compiled overlapping HTTP writer/restore
proof. No claim of a reproduced business race: the missing-proof assertion failed,
while new consistency controls pass. Corrected full Cloud1607/91/lintbuild0; compiled
Linux9 online checks/4 phases0. Exact corrected Windows evidence remains required.
