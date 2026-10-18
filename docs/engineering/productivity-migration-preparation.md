# P02 migration preparation and acceptance

This repository prepares migration through existing I01-owned APIs and synthetic
Windows CI. Runtime startup reconstructs an already active installation; it does
not activate a legacy installation. Controlled `productivityV2` rollout is owned
by P18 and the master milestones. This P02 slice adds no live activation endpoint,
operator command or default feature enabling.

## Prepared migration boundary

`registerProductivityMigration` registers trusted schema, immutable v1 checksum
and the shared snapshot validator. `applyDomainMigrations` requires an explicit
pilot snapshot option. `migrateTasks` returns a report and preserves original task
IDs, comments, history, proof/approval/reward/recurrence/rotation metadata in frozen
provenance. Legacy overdue maps from generated history only; ambiguous state and
due-time assumptions remain warnings. A registered migration currently discards
its returned warning report (a recorded P02-a Minor); raw provenance remains.

`activateCanonicalTasks` is an internal trusted gateway operation. It requires
an installed compatible reader, exact v1 migration identity, the expected source
digest and unchanged frozen pilot provenance. Unrepresentable experimental task
records are refused. The same transaction deletes raw task rows and publishes
its marker. A failure leaves the source inactive; repetition does not change IDs
or revisions. The pilot is an immutable preview, not a second live task writer.

Windows producer `scripts/ci/write-productivity-fixture.ts` performs this boundary
in disposable synthetic storage and exports its result to the consumer harness.
The production ZIP contains no fixture or TS tooling. The downloaded compiled
consumer independently reconstructs canonical reads/writes, restart, snapshot and
encrypted recovery. All data used by those checks is synthetic; no real provider
or notification delivery is part of acceptance.

## Active legacy characterization

The mandatory `legacy-characterization.test.ts` suite verifies behavior through
real FamilyDB methods and the same SQLite gateway: Child submission waits for
adult approval without points, authorized approval grants once, annual recurrence
creates exactly one clean next task with the rotated assignee, and repeat updates
do not repeat points or occurrences. Rejection keeps proof/audit without points;
forged reward edits and failed approval transactions roll back. Retried request
identity returns its original result. Shared snapshot restoration preserves IDs,
provenance, approval, recurrence and points without replaying completion.

These four characterizations pass the existing source; they are preservation
checks, not newly failing implementation tests. The report gate has its own causal
RED→GREEN test that refuses omission of this suite. Fresh Node22/24 Windows reports,
JSON/JUnit and all existing first-attempt browser/package/service checks are still
required before accepting the final P02-b3 HEAD.

## Boundaries carried forward

P03 must handle its new DTO values before creating them: TaskRecord permits
priority `none` and lifecycle `wont_do`, while the current legacy projection
intentionally refuses those experimental records. Legacy auth reads the whole
projected document, so supporting these values is a consumer-interface change,
not evidence already provided by v1 SQL schema acceptance. P03 must retain the
existing ACL/auth boundary and completion ownership; new completion/recurrence
semantics remain with P10/P11.

Recorded Minors stay visible: new legacy task append order reverses when its rank
is assigned by the bridge; tag ordering, damaged pilot schema-definition trust,
migration warning-report retention, historical clock boundaries and canonical
child-process diagnostic log retention remain deferred. No claim of canonical
WinSW or actual WindowsServer2019/R02 acceptance follows from these tests. No
release, tag, VPS access/deployment or user-PC runner is performed.
