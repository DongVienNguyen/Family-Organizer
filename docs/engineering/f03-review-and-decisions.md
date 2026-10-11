# F03 review and decisions

One fresh read-only reviewer assessed the whole branch at5f4c451 after Windows CI
passed206tests. Review reproduced four Important and two Minor defects. CI success
at that SHA remains a historical result, not proof these defects were absent.
The author made one fix pass with regression tests; no assertions were removed.

| Finding | Correction / regression |
| --- | --- |
| Failed SQLite schema initialization retained DB/WAL/SHM handles | All pragmas/schema/statement initialization owns cleanup inside sqlite.ts; malformed app_meta fixture observes the real connection closed before startup rejects and renames/deletes storage while its process remains alive |
| Second start disposed the first runtime's singleton connection | Synchronous process ownership claim before asynchronous startup; duplicate/concurrent starts reject without touching storage; original runtime still reads/writes/closes, subsequent restart requires a fresh process |
| Asset disposal rejection skipped native close; disposal/storage promises had no deadline | After owners drain, independently attempt bounded asset disposal and native closure, retain failures and idempotence; throwing startup/shutdown disposal, pending disposal and asynchronous storage-close tests |
| Readiness wrote/recreated storage during maintenance | Probe only in ready/non-migrating phase; held maintenance removes a directory and repeated readiness calls cannot recreate it; starting/draining/failed/stopped/migrating phases do not probe |
| Backup failure suppressed birthdays | Independent error handling/logging preserves birthday generation despite synthetic backup failure |
| Parser/client errors became500 | Preserve400/413 client status with generic response; malformed and oversized JSON tests |

The new ownership suite is mandatory in the Windows evidence gate. RED checks
reproduced the native-open and original-runtime-connection failures on the baseline;
GREEN full Cloud suite216tests/24files, lint/build and compiled production fixture
passed. Windows results and immutable tested SHAs are recorded in implementation-status
and the evidence snapshots after their runs. These tests use synthetic storage and
offline adapters; no real notification/AI delivery or production credentials.

Execution rulings and costs:

1. Keep injected existing route/store/provider modules instead of rewriting domain
   behavior. Cost: real HTTP/process regressions must cover hidden legacy coupling;
   multiple installations in one process remain unsupported.
2. Establish one startup attempt per process, including after close/failure, because
   cached legacy modules own a singleton connection. Restart uses a fresh process,
   as CLI/service recovery will. Cost: embedded callers cannot reuse startApplication
   after stop; I01 must retain explicit ownership if it changes store internals.
3. Add only the process AppJobs registry now, sharing namespace/type/pause/drain with
   future I01 leases/retry/outbox. Cost: I01 must extend this registry, not introduce
   another scheduling engine; durable ownership is not claimed here.
4. Use stdin stop plus POSIX signal hooks for graceful CLI shutdown; Windows kill
   remains a crash. Cost: F07 must wire and prove the actual WinSW service protocol.
5. Asset disposal releases Vite resources without DB ownership. After DB owners
   drain, attempt storage close even on asset failure/timeout; never close underneath
   undrained owners. Each stage is bounded and CLI has a35second hard failure exit.
   Cost: future disposers must preserve this contract; timeout reports failure and
   requires operator investigation, not graceful acceptance.

No review code defect is deferred. Existing bundle warnings remain F09; I01 online
snapshot/restore, F04 authorization/media, F05/F09 full browser/domain/performance,
F06 portable ZIP, F07 service wiring and R02 Server2019 are separate pending tasks.
