# P10-d2 virtual recurrence preview

The approved P10 contract now has a read-only preview owner. It returns virtual
slots rooted in an existing canonical Task. It creates no Task, occurrence,
accepted claim, reward, rotation advancement, Wallet posting or notification.
Default migration registration remains6; registration and preview need explicit
pilot schema10. No schema is upgraded by a request.

## Planning and bounds

The existing Task is ordinal0. A count bounds all slots by ordinal<count, matching
P10-d1 exception bounds. Selected explicit dates describe successor slots from
ordinal1 in sorted unique order; selected earlier dates are retained rather than
silently filtered. Due-based calendar slots always use the original anchor, so a
Jan31 clamp does not turn March into March28. Completion-based slot identity can
increase, but its next date advances one interval from actual accepted completion.
Unknown acceptance stays unresolved; a pending submission is never that anchor.
The current preview uses the root's accepted reference only for its first
successor; later accepted-occurrence history belongs to the materialization owner.

Range is [from,toExclusive) in series-local YYYY-MM-DD dates, at most366days.
Calendar ranges jump near the first relevant ordinal rather than scan old history.
Every future exception is also considered, so a slot moved into the range from
outside it is retained. Skip and explicit due-none have distinct stored intents;
neither is a dated calendar result. Exceptions can resolve an invalid calendar
slot or DST wall time, but cannot resurrect a slot beyond the rule's count,
explicit-date list or end date. Effective dates after an inclusive end are omitted.
More than1000 results fails422; exactly1000 is returned without truncation.

Timed rules retain original wall time and milliseconds. A DST gap/fold returns
explicit resolution metadata instead of guessing an offset. Preview contains no
future assignee, raw policy/rotation roster, points or Wallet data. Unresolved
completion-based futures are not invented as calendar entries. Explicit due
exceptions at current or later ordinals remain visible without inventing acceptance;
skip/no-date, count, local end and range constraints still apply.

## Authority and internal HTTP

POST /api/productivity/tasks/series accepts only taskId, expectedRevision and
policy under existing Family-Organizer authentication/request UUID. Only a current
adult with Task update authority can configure it. The I01 gateway owns revision,
idempotency and audit receipts; a successful create invalidates existing Task
readers through the existing scoped SSE mechanism.

GET /api/productivity/tasks/series/:id/preview accepts only from/toExclusive.
Current session, user role and Task read ACL are checked on each read. Child,
guest and read-only members can read only previews of Tasks they may currently
read; this does not grant configuration authority. Missing/private responses are
identical. Private responses retain no-store. No public integration API or token
surface is added. HTTP auth bookkeeping is distinct from domain writes; all Task,
series, occurrence, reward, notification and populated synthetic Wallet rows stay
unchanged during preview.

Supported pre-series schema9 returns409 without upgrades. A synthetic future11
identity is refused by the existing auth/storage guard before the handler; its
own no-mutation assertion remains. The first fixture incorrectly tried to inject
that unsupported identity through a gateway that correctly rejected it; raw
fault injection on the isolated test database now verifies the intended boundary.
No existing guard was relaxed.

## Measured date conversion bottleneck

The unchanged1001-exception assertion initially exceeded the existing10second
unit timeout. CPU profiling of1001 real slot plans measured8693ms, dominated by
repeated ICU formatter construction inside local-date binary searches. A private
bounded32-entry formatter cache now serves those calculations; public formatter
instances remain fresh and caller-owned. Tests cover cross-zone results, invalid
inputs and public formatter mutation isolation. The same CPU-profiled1001-call
probe measured726ms after correction. This single Cloud observation is not a
Windows p95 benchmark. The original1001-case test passed atabout729ms without
changing its timeout or assertions; exactly1000 and366day boundaries are checked.

## Verification status

Actual checkpoints and source hashes are recorded in the development evidence.
Slot24RED→117targetGREEN; service17RED then40/41 with the actual timeout retained;
cache correction97targetGREEN. HTTP's initial fixture lacked Wallet tables; after
explicit synthetic Wallet setup six route assertions failed and the future-identity
fixture was still rejected by the gateway. Later6/7 passed
with the unsupported-identity fixture error; the boundary diagnostic proved the
existing auth guard before correcting the HTTP pre-series fixture, then8/8 passed.
Mandatory-suite omission317/313/4RED is retained. Consolidated470/470 target and
lint/build passed; pre-review fullCloud5079tests/275files/matchingJUnit passed
with0failed/skipped. Fresh whole-branch review found0Critical/2Important/1Minor.
All findings were graded before one TDD correction pass: explicit completion
deadlines are retained, and a detached validated planner is prepared once per
projection. Actual service21/18/3RED and planner25/24/1RED became474targetGREEN.
The366-date regression observed368whole-policy validations before correction
and bounds shared validation to at most2afterward, retaining all366dated results
and ordinal checks. No test deadline or assertion was relaxed.

MinorM1 is deferred: an extreme historical daily anchor can make the nominal
range fast path exceed100000ordinals before examining moved bounded exceptions;
it returns422. Exact Windows qualification and corrected full-suite evidence
are recorded separately before acceptance; no rereview is required.

Full P10 still needs accepted-occurrence claims/materialization, series editing,
skip commands, scheduler restart, legacy cutover and UI integration. No pilot flag,
release/tag/VPS or Server2019 R02 acceptance is implied.
