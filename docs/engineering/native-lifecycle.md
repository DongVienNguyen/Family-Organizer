# Native application lifecycle — F03

`createApp(config, dependencies)` in server/app.ts builds the existing routes.
Dependencies include the legacy DB/media/provider modules, a shared AppJobs registry,
a metrics sampler, build identity and RuntimeState. Type-only module imports keep
factory import free of SQLite, HTTP and scheduler startup. Pure fixtures can inject
these ports; production startup explicitly selects one installation per process.
The legacy store is not rewritten into a second database manager. Startup claims
this process before any asynchronous work; another start is rejected without touching
the current owner. After stop or startup failure, restart requires a fresh process
because the legacy modules cache one connection. SQLite initialization closes the
native handle itself if schema/statement preparation throws before exports exist.

`startApplication()` validates selected roots/write permissions, imports SQLite and
bootstraps legacy storage, creates routes/assets, then calls startManagedServer.
Readiness is false before initialization/migration completes. `/api/health` retains
its liveness/version response; `/api/ready` returns503 during migration, maintenance,
drain or failed storage probes. Only a ready, non-migrating phase invokes the
write-permission probe; unavailable phases never recreate or write storage. Both are minimal service-health endpoints; all
existing business API authentication remains. No public integration/control API.

Maintenance is an internal `runtime.maintenance(work)` operation for I01. It gates
new requests, drains accepted bodies/responses/async handlers, ends SSE, suspends
scheduled jobs and drains detached push callbacks before work owns storage. Resume
only after successful work; failed/timeout maintenance remains unavailable. Stop
also waits for active maintenance. Request handlers remain tracked after client
socket disconnect. Startup jobs are not replayed immediately on maintenance resume.

Close is idempotent and bounded: stop intake, end SSE, close idle HTTP connections,
abort/drain jobs, drain handlers/responses/effects, dispose dev Vite, checkpoint/close
SQLite. Asset disposal and storage closure have separate bounded attempts after
ownership drains; an asset error or timeout still attempts native close and reports
failed shutdown. Asset disposal may release Vite resources but must not access DB.
The configured timeout bounds each drain/disposal/close stage; CLI additionally
forces a nonzero process exit after35seconds. Timeout is a failed shutdown, never a green result; storage is not closed
under a still-running handler. CLI then exits nonzero and OS releases resources.
Operators must investigate the failure rather than treat it as graceful success.
CLI supports stdin line `stop`, SIGINT and SIGTERM, and handles fatal HTTP/process
errors as failed shutdown. Windows process.kill(SIGTERM) forcibly terminates Node,
so CI tests the stdin protocol for graceful stop and SIGKILL separately for crash.
Actual WinSW stop wiring remains F07 and Server2019 acceptance remains R02.

AppJobs owns every legacy schedule: reminders, daily backup/birthdays, metrics,
market history, Telegram backup and weekly digest. Each namespace/type is unique;
per-handler execution is serial, errors are logged, no timer starts on registration.
Automatic backup and birthday generation retain independent error handling so a
failed backup does not suppress birthdays. Parser errors keep400/413 status codes
with a generic response body.
I01 must add durable leases/retry/outbox to this same registry; F03 does not claim
that engine is finished. Provider routines still drain rather than guaranteeing
remote cancellation; a hung call hits the shutdown deadline and fails explicitly.
Tests clear credentials/block external delivery and use synthetic fixtures only.

Metrics use os/process and statfs(DATA_DIR), including process RSS/uptime. Missing
volume is null; CPU/SSD temperatures and load-average are explicitly unsupported,
not fabricated zero values. Existing telemetry rows remain readable.

App apply/restart/auto-update/Immich management routes, background updater checks,
mailbox writers, updater controls and ImmichUpdateCard are removed. Existing
external-service shortcuts remain. Updater module now supplies readonly build
metadata/pure legacy parsers. Old data/update snapshots are preserved as migration
input; neither clean nor startup deletes them. Release creation is still disabled.

Tests prove factory isolation, HTTP health/auth/removed controls, maintenance gates,
partial-body/async-disconnect drain, timeout ownership, job suspend/resume, detached
effects and metrics. Real source process tests exercise HTTP writes, graceful stop,
file rename/cleanup, restart and abrupt crash recovery. CI also tests the compiled
production-only layout from System32, Unicode/spaces roots and actual ACL denial.
This is not full browser/domain/restore coverage or a portable ZIP/service acceptance.
