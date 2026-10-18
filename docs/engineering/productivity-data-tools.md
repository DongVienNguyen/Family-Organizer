# P13 owned Task import and export

Production19787cb and fixture-only40031f7 add explicit pilot18. Default6,
frozen1–17 SQL/checksums and Windows package capability13 stay unchanged.
This is Cloud development evidence; no new-source Windows acceptance is claimed.

The Task data workspace accepts JSON/CSV/ICS files up to20MiB and10,000 rows.
It validates UTF8, title/body, typed dates/timeboxes, source list mapping and trees
up to5 levels. Preview/mapping do not write Tasks. Files and previews belong to
the authenticated actor/role. Original source facts remain opaque; import creates
fresh private unfinished Tasks and checklist IDs without executing old creator,
assignee, rewards, approvals or recurrence. Invalid rows give a logical row
number without echoing private source text. Existing Notes stay canonical.

A default list and up to100 source-list overrides carry reviewed revisions.
Current create/list authority is checked before cached mapping/commit receipts
and inside I01. A real mapping replay regression caught the original omission.
The provider retains the original Blob/revision/key through unknown ACK and view
navigation, retires revoked targets and clears private state on logout, including
late error feedback. Commit/undo use existing in-app review/confirmation.

The shared AppJobs registry owns durable processing; each command writes at most
50 Tasks, yields and resumes with the same fresh UUID/parent mapping. Actual101
Task interruption/resume, whole-batch rollback, real HTTP20MiB and registry-driven
commit/undo are tested. No second scheduler/writer is introduced. Failed/unknown
work requires review; explicit undo cannot race a live pending/leased job. Shared
snapshot18 preserves source/mapping/progress and retires queued work for review,
without automatic replay of Tasks, points or notifications.

Conditional undo compares the Task and independent FK references and checks live
children. Changed children retain their ancestors; a new template link retains
an otherwise unchanged Task. Only unchanged independent items are soft-deleted.
The preview quota is3 pending batches/100MiB retained normalized source per actor,
50MiB per normalized batch. Uncommitted preview rows expire after24h; metadata
remains and existing Tasks are not changed. Larger retention/capacity is W18.

JSON exports selected canonical Task fields/checklist and legacy history exactly;
use the full shared backup for attachment bytes and installation recovery. CSV
exports draft fields with explicit reversible spreadsheet escaping. Ordinary CSV
imports never guess that a leading apostrophe should be removed. ICS exports
calendar dates/text; unsupported source recurrence is kept with a warning rather
than activated or approximated. Exports use current SQL ACL before bodies and
recheck selected revisions/scope during streaming. No public credentials, bank
integration, external importer/provider calls or new dependencies are added.

Full8749tests549files/matchingJUnit,0failed-skipped-todo at40031f7; all8675 parent
cases plus74 retained. Lint/build0. Build19787cb is unchanged by the cancel-label
fixture follow-up. Same-build first-attempt Chromium25/25: data4/attachments3/
content4/templates3/notifications4/collaboration3/calendar4, owned18/17/16/15/14/
13/13, offline providers, normal stop/integrity/closed handles/cleanup. Both390px
visible import forms/previews were inspected; the element screenshots extend
past the app scroll viewport. Desktop journeys exercise download controls.

[Proof and retained failures](evidence/p13-data-development.json). The first
browser failure was an incorrect new fixture cancel label; its leftover preview
correctly exercised the3-pending quota later. Quotas/assertions/timeouts/retries
were preserved. Author review only. All P13 slices are usable in Cloud; final
composed Windows/pilot acceptance and remaining master tasks stay open. No full
10000-Task import/performance claim, release, tag, VPS or Server2019 acceptance.
