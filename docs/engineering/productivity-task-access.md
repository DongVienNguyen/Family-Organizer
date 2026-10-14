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
