# P12 collaboration functional core

Canonical Task comments, immutable history and current-authority mention recipients
are available in the task drawer. The same I01 receipt owns the comment, history,
activity and targeted inbox/outbox references. There is no new comment store or
schema migration. Existing native push retries/leases remain shared; tests use an
explicit offline push adapter. External provider receipt is not exactly once.

Commenting now requires the same edit scope as the Task command, including on the
canonical legacy HTTP adapter. A read grant can inspect history but cannot append.
This is the approved P12 permission change: the old P03 semantic-comment test now
checks read-scope comment403/no mutation, retains generic-edit403 there, upgrades
through the real I01 contribution grant, then retains its comment200/exact-content
assertions. No assertion was removed or skipped. Noncanonical legacy behavior is
retained. UUID comment/history IDs do not depend on clock resolution.

The drawer reads bounded50-entry pages (maximum100) with current Task ACL. Cursors
bind actor, kind and Task revision; historical duplicate IDs are preserved using
source indices, and unknown legacy dates remain explicit. Mention choices contain
only live family users who can currently read this Task; the worker checks current
source access before the offline/native push adapter. The new inbox invalidation
is scoped to recipients; SSE never carries bodies, titles, IDs or counts.

List managers can inspect and review grants for existing adult Members. The UI
label Contribute maps to the existing write permission. Children/guests cannot
receive grants; there is no invitation service. Existing family-shared read access
is clearly distinguished from individual grants before removal.

A session owner retains uncertain comment/grant packets through SSE, closing the
drawer and projection navigation. Retry sends the original body/revision/key.
Current Task/management denial or logout clears private packets and fences late
continuations. An explicit conflict reload permits review before a new send;
there is no automatic retry, rebasing or offline write queue.

Source7a73d55: full Cloud8502tests512files/matching JUnit, lint/build0. All8459
parent cases remain, with the one documented policy transition above and43 new
cases. Whole Collaboration Chromium3/3 and Calendar4/4 first attempts, isolated
schema13 fixtures, offline boundary, integrity/normal-stop/closed/cleaned and exact
source/build hashes. Both390px themes were inspected. Original baseline/HTTP/SSE/
full-suite failures and final reports are retained in
[evidence](evidence/p12-collaboration-development.json).

P12 is not complete: durable reminders, per-user quiet hours/digest, update
cancellation/rescheduling and restore backlog consumption are next. Final composed
Windows must include the parent suites plus both new feature harnesses; neither
new harness is currently wired to Windows CI. No Windows result is inferred from
Cloud. Server2019 R02, release/tag and VPS deployment remain separate/unrun.
