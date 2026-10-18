# Held update startup and rollback boundary

F07-j adds internal runtime/policy ports for the owned Windows update controller
in F07-k. It does not apply a release or perform a rollback. Normal startup without
CONFIG_DIR/update-control.json keeps its existing readiness and jobs behavior.

A native Administrator operator must publish this fixed file with protected
Administrator/SYSTEM full control and only the installation service SID read
access. Check ordinary paths, file ownership/DACL and trusted ancestors before
publishing. The control is public metadata, not a token or an HTTP API:

```json
{"format":1,"operationId":"00000000-0000-4000-8000-000000000000","manifestSha256":"<64 lowercase hex>","phase":"held"}
```

The loader checks bounded counted UTF8 reads, single links/no reparse, exact fields
and the configured release manifest hash before opening SQLite. The native operator
separately verifies the entire trusted package before launching its canonical service
configuration. The runtime hash binding does not replace package authentication.

While held, the owning listener exposes existing health/readiness, with readiness503;
all application routes and AppJobs remain unavailable. Readline/signal stop handlers
are already installed. Shutdown aborts and drains startup validation before disposing
resources/checkpointing/closing SQLite. Intentional held stop is exit0; an unrequested
startup validation failure remains unavailable and the CLI stops with exit1.

The operator's durable approve phase must follow its own candidate health/smoke
checks. Runtime additionally checks health version, SQLite integrity, nonempty users,
persisted legacy/job versions, snapshot engine bounds and every enabled domain
migration before accepting approval. Removed/foreign/malformed control, changed
manifest, failed health/storage/schema and a monotonic30s approval deadline fail closed.
There is no await between committing the I01 public writes-may-open record/command
ledger and returning to the lifecycle that marks ready and starts jobs.

The marker is update_writes_opened:<operationId> in app_meta, with format1,
operationId, manifestSha256 and writesMayOpen:true; the same transaction owns
core:update:open-writes in app_commands. It records a conservative boundary,
not proof of how many business writes occurred. Cached command results alone are
insufficient if the metadata row is missing/damaged.

Automatic pre-update snapshot restore requires a proven held approval phase and
absence of every durable possible-open record. Any recorded approval, unknown phase
or metadata/journal uncertainty blocks it. Approval is an independent file/journal
latch: restoring an old DB cannot erase permission that already allowed writes.
F07-k must preserve a monotonic external operation journal and inspect approval,
DB metadata and command history; it must not decide from the DB marker alone.
After that boundary recovery/delta reconciliation needs an explicit operator decision.
Binary rollback requires the previous manifest to cover the actual persisted schema;
a snapshot restore before writes checks the restored snapshot's schema instead.

The hosted Windows service fixture uses dedicated sealed directories on C:, publishes
protected controls, verifies reinstall read permissions, holds real HTTP/login/writes
and job state, stops while held, approves a new attempt, checks durable metadata before
readiness and preserves canonical business/17-point claim data. Source tests use
synthetic installed-manifest fixtures and a blocked external network; they are not
package-authentication or Server2019 evidence. Native proof is pending until the exact
HEAD run and its typed reports have been read. F07-k orchestration, actual off-host
independence, F08/F09/F05 enforcement and Server2019/reboot/RPO/RTO remain. No release,
tag, VPS or production provider operation is authorized or performed.
