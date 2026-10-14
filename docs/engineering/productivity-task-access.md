# Task access and semantic writes (P03-a)

P03-a supplies internal domain ports; HTTP/media/realtime/export/search wiring
is P03-b and is required before claiming P03 acceptance. It does not enable a
new task UI or automatically activate existing installations.

createTaskAccess(reader) filters rows in SQLite before decoding body or legacy
provenance. Admin can manage tasks; Member can read shared/own/assigned tasks
or tasks in lists they own/have a read/write/manage grant for. Editing requires
ownership/assignment or write/manage permission. Child can read shared/own/assigned
tasks and edit own/assigned tasks. Guest retains read and existing comment behavior,
with generic writes forbidden. A read grant never implies write; list grants do
not widen Child/Guest access.

createTaskCommands({write,reader}) receives trusted ports; importing it opens
no connection. It requires an active canonical installation and a live user
whose stored role matches the trusted actor. ACL checks run before gateway
idempotency lookup and repeat inside its owned transaction. A revoked grant or
deleted actor cannot retrieve a cached private command result.

Create uses server-generated ID, timestamps, creator, audit history, zero reward
and revision1; the command's expectedRevision is0. Update accepts only TaskPatch,
compares expectedRevision, increments it and records actor/field names in history.
Creator, createdAt, list/structure, lifecycle/completion, reward, approval and proof
metadata cannot be forged through generic patches. Completion remains the existing
legacy workflow, then P10. Invalid field names return400, unauthorized writes403,
invisible objects404, stale/conflicting commands409, invalid values/assignees422.

New tasks can use no deadline and priority none. The old UI projection displays
none as low; an unchanged projected priority in an old form preserves canonical
none, and explicit new commands can change it. P04's drawer exposes the full
canonical choices. wont_do terminal projection remains P10-owned and is not
created by generic commands.

Bodies remain plain Markdown strings. The existing renderer escapes raw HTML
and filters unsafe links; its synthetic SSR regression asserts no script element,
HTML event handler or javascript href executes. No HTML-rendering mode is enabled.
Synthetic tests also cover native SQLite ACL, role forgery, immutable metadata,
stale revisions, retry conflicts, revoked grants, active legacy projection and
shared snapshot preservation. Full Windows evidence is recorded separately;
Cloud Linux checks do not establish WindowsServer2019/R02 acceptance.

## P03-b internal HTTP and legacy policy wiring

An active canonical installation exposes authenticated app-internal
GET/POST /api/productivity/tasks and GET/PATCH /api/productivity/tasks/:id.
Writes use {expectedRevision,input} or {expectedRevision,patch}; the actor and
request ID come from the existing opaque session/command middleware. New DTOs
omit storage provenance/rank. Inactive installations return409 for these routes
after authentication and retain their original legacy task policy.

The explicit canonical bridge injects current task read/edit rules into legacy
task routes, direct detail, comments, media, search, assistant context, notification
and queued push projections. Legacy approve/reject/delete require edit permission
as well as adult role; read-only grants cannot approve or reward. Private/missing
active legacy deletes both return404. Generic completion still belongs to P10,
with the current child submission/adult approval behavior retained.

At explicit activation, existing live Members receive a persisted manage grant
on legacy-family once, preserving existing adult family approval. Repeated
activation never recreates a revoked grant. Newly added Members are not silently
grandfathered; list management belongs to P04. Startup and restore do not backfill
grants. Admin can manage all tasks.

Task/reward SSE invalidations recheck task visibility and contain event types,
not task IDs/body/proof. Reassignment invalidates prior authorized viewers once
to clear stale private caches. New task Markdown media references bind through
the shared transaction/media policy; copied private proof URLs cannot be bound
to another task. Authenticated managed media remains the delivery path.

Family reward balances retain existing behavior. Hidden canonical task sources
use an actor-specific HMAC public ledger ID and a safe field whitelist; task ID,
reason and arbitrary source extensions stay private. Stored ledger IDs, points,
claims and snapshot data remain unchanged.

Existing full forms may retain an unchanged canonical no-deadline or long body;
changed values retain existing legacy validation. New HTTP schemas reject forged
wrapper/patch fields and non-nullable null values. The unhandled request logger
records status, preventing body-parser error objects from logging private bytes.

Synthetic native HTTP tests cover roles/grants, readonly approval/delete, private
lists/count/search/media/admin-export denial, notifications/rewards, offline AI
and push rechecks, SSE prior audience, HTTP retry/conflicts and inert payloads.
The downloaded compiled consumer also requires actual semantic create/retry,
none/no-date, old full-form compatibility, stale/forged refusal and restart proof.
Source/Cloud validation does not establish exact-HEAD Windows or Server2019/R02
acceptance; see implementation-status and final PR evidence for current results.
