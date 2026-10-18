# P12 task reminders and notification preferences

This is the Cloud functional implementation, source1a4d2a3. Schema14 is an explicit
pilot addition; ordinary startup only registers the version already persisted.
The default migration remains6, frozen1–13 DDL/checksums/Task facts remain intact,
and Windows package caps have not been promoted. Controlled conversion/pilot and
Windows qualification belong to P18/I03; this is not Server2019 acceptance.

The Task drawer schedules an explicit UTC instant, an offset before a timed due
instant, or an offset before scheduled start. Date-only due values require the
user to select a real reminder time. Empty dates remain empty; DST gaps cannot
silently become valid, and repeated wall minutes require an explicit offset.
Custom rules replace that Task’s old fixed reminder windows; disabling all custom
rules stops those reminders. Tasks without custom rules retain their old defaults;
Plan/medical reminder producers remain unchanged. Existing assignee controls now
stage canonical assignment/reassignment notices in the same Task command.

A unique Task/occurrence/recipient/kind/canonical-fireAt claim and I01 receipt own
the inbox effect. Equivalent UTC spellings cannot create another rule/claim.
Task changes synchronously cancel/re-anchor pending work, including retained Task
adapters. Rules have at most64 entries per Task. Bounded worker batches and hashed
continuation keys preserve256-character legacy Task IDs. Job leases, backoff,
shutdown/drain and outbound push remain owned by AppJobs and the legacy effect
outbox. No test delivers a real notification; external provider receipt is not
promised exactly once.

The existing Push Notifications card includes own-user immediate/daily and quiet-
hour preferences. Inbox records remain available even when outbound Task push is
disabled or device permission is denied; device permission is managed separately.
The worker checks current preferences at dispatch and current source/recipient ACL
before queuing an effect. The push worker checks source access again. Daily digest
content is generic and stays visible only while at least one current source is
readable. Deactivated recipients do not block other recipients in the batch.

Restore consumes old pending outbound notice references inside the shared SQL
replacement transaction through a synchronous, minimum-version domain policy.
It preserves inbox history, applies the shared job restore fence, and rejects old
epoch commands. Genuine future reminder intents are re-authorized when due.
A failing domain policy rolls back replacement; snapshot clock skew cannot revive
an old delayed digest. No second restore engine or scheduler is introduced.

Browser-session owners retain reviewed reminder/rule/preference packets through
lost ACK and navigation with the original revision/body/key. Fresh source denial
or logout retires private packets and late continuations. Unsent own preferences
also survive unrelated Task SSE without rebasing their original revision.

Cloud full8560tests520files/matching JUnit, zero failed/skipped/todo; all8502
parent cases plus58 retained, lint/build0. Notifications4/4, Collaboration3/3 and
Calendar4/4 Chromium journeys pass on the same source/build, first attempts only,
with offline/owned fixtures14/13/13, normal stop, integrity, closed handles and
cleanup. Both390px reminder themes were inspected. Original restore/review and
fixture failures are retained in [proof](evidence/p12-notification-development.json).

New feature harnesses still need mandatory Windows CI wiring. Whole parent
Productivity/touch/Wallet suites, Node22/24 Windows package/service/performance,
actual Server2019 R02, and P18/W18 capacity/pilot/rollback remain separate. No
release/tag, VPS deployment, or PC runner was used or requested.
