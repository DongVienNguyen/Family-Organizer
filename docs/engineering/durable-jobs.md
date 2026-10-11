# I01-b durable jobs and outbox

Starts from authorized I01-a squash `ab83299eb91760dcdebde571ed852d14fdb0b76e`.
Uses the existing `AppJobs` registry and SQLite connection, not another scheduler
or connection manager. Importing the application factory still opens no storage.
Production runtime injects `AppJobStore`; explicitly injected in-memory test
registries retain the F03 scheduler contract.

`enqueueAppJob(tx, input)` inserts managed JSON payloads in the same synchronous
transaction as the domain/legacy write. Namespace/type/key is unique; canonical
payload, kind, retry limit and an explicit schedule form the hash. Matching retries
return the prior ID; changed payload returns409. Payloads have a1MiB limit; large
objects require managed references. Core job schema is versioned and initialized
through the existing gateway before readiness. Persisted version compatibility is
checked on every bootstrap even when the initialization command is cached. Domain migrations remain flag-off.

Claims serialize on the same handle, increment attempts and assign an unguessable
lease token/deadline. Completion, renewal and failure require the current token
and a live deadline. A second registry cannot claim a live lease. Heartbeats
extend leases while accepted async work is draining. The actor context carries
a write-ownership check before a business transaction and before native COMMIT;
an expired/replaced worker cannot perform a delayed points/domain write.

Known failures retry with bounded exponential backoff (1s,2s,..., max60s) and a
configurable1–20attempt limit (default3). A command retry retains its original
job ID and namespace, so a prior committed reward command returns its result.
Ordinary expired commands can be reclaimed; an expired external effect becomes
`unknown` and is never automatically replayed. Provider acknowledgement uncertainty
is not exactly-once delivery. Stable push notification tags reduce duplicate
banners; they are not proof that every recipient received the message.

Legacy intervals enqueue stable timezone-aligned period keys and use this same
registry. Pausing gates new claims, aborts accepted work and awaits handlers;
maintenance resume waits the usual next interval rather than rerunning startup
work. Scheduled Telegram backup/digest jobs are external effects. Daily backup and Monday digest use durable local-calendar occurrence keys,
so an unknown outcome also blocks subsequent 30-minute ticks and restarts for
that occurrence. A later day/week is a separate operation. Their bounded
provider calls propagate failure/uncertain outcome, await failure alerts and
temporary-file cleanup, and no longer acknowledge a caught delivery failure.
Cleanup failure cannot replace an uncertain primary delivery outcome; errors
after acknowledgement cannot trigger automatic redelivery. A locked temporary
file is reported without exposing its path and may require operator cleanup.

All four legacy notification producers enqueue per-recipient push references in
their owning command. No provider call occurs before commit or on rollback. The
same registry resolves current notification, user and subscription before sending,
checks cancellation/lease ownership, uses an owned HTTPS request with an absolute15s deadline and cancellation,
awaits request closure, caps response data at64KiB, and removes dead
subscriptions through the gateway. Queue payloads contain references, not push
subscription keys or provider credentials. Known provider rejection can retry;
network/acknowledgement uncertainty becomes `unknown`.

`restorePolicy(tx, now)` is a prerequisite for I01-c: after worker pause/drain,
it drops restored pending/leased historical commands/effects and stale schedules,
clears tokens, and retains only explicit unclaimed future schedules. Completed
records remain historical. I01-c must wire this policy to validated, journaled
snapshot restoration; this PR does not establish snapshot/media/file recovery.

## Verification

Windows RED [38147654737](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38147654737),
HEAD `e4ccca1b990edcc8163ea8dfd1712fc9530d3f4e`: both runtimes239existingtests
passed and seven new queue tests failed at unimplemented ports. A test-helper
TypeScript inference error also failed lint in that RED commit; it is corrected
with an explicit string parameter. Full logs/artifacts were downloaded/read.
No skipped tests or continue-on-error.

Further Cloud RED→GREEN covers durable drain/resume, heartbeat exclusivity,
crash-safe reward retry, expired-worker SQL fencing, legacy push producer/consumer
and bounded mocked provider outcomes, plus Telegram/digest failure ownership.
Complete Cloud Node24 suite257/257 in33files and lint/build pass; exact-HEAD
Windows verification follows the source commit. All fixtures are synthetic and
providers are explicit offline adapters; no notification or AI provider was called.

A preliminary shell-wrapped targeted run printed7passed but returned exit1;
the direct rerun returned0 with7passed. Both actual outputs are retained; this
is not CI proof. All later validations record dedicated command exit variables.
Exact Windows full-suite evidence is still required before merge.

## Remaining gates

I01-c must supply full WAL/domain/points/media/version snapshots, validation,
worker-aware restore, filesystem staging/journal and interrupted-startup recovery.
The shared I01 task is incomplete until then. F04 privacy/auth/media/dependency
audit, F05/F09 browser/coverage/performance, F06 ZIP, F07 WinSW/recovery encryption
and R02 Server2019 remain their own gates. No release/tag/VPS.

### I01-b review correction

First Windows GREEN [38149368740](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38149368740)
at `f9bbdc00eba6f49247309a14014047d98638f3f2` independently proved257/33 on both
runtimes, all six exit checks0 and ci-gate. Its artifacts/hashes are preserved in
`evidence/i01-b-first-source.json`. It is superseded for acceptance by the review
fixes: see `i01-b-review-and-decisions.md`. Four Important findings received one
fix pass, with seven regression cases observed RED and then GREEN. An additional
owned-transport successful response regression verifies the happy path. The full
corrected Cloud suite is265/265 in34files, with lint/build checked separately.
Corrected exact-HEAD Windows CI and final documentation HEAD still require their
own runs before merge; the first GREEN does not prove the corrected SHA.
