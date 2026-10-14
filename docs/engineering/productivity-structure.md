# Task organization storage and commands (P04-a)

P04-a extends the accepted canonical task domain through the shared transaction,
ACL and snapshot ports. P04-b owns authenticated structure routes and the shared
editor/drawer UI. Full P04 and dependent P05 are not accepted before the named
UI, keyboard and phone checks run. Controlled activation remains P18-owned.

Migration1 SQL, columns and checksum remain immutable. Explicit pilot migration2
adds catalog revisions/archive metadata and checklist items, with a parent index.
It validates existing tree metadata before DDL; an invalid pilot leaves version1
and schema unchanged. Startup continues reading supported v1 without upgrading it.
It refuses future migration3, checksum changes, orphan tables or unsupported
columns before bootstrap writes. Current package compatibility is1..2; that is a
source contract until exact-HEAD Windows evidence verifies it.

Restore remains within the installed domain version. Restore a v1 backup into a
v1 target, then explicitly upgrade through the shared pilot migration; v2 backups
restore into v2. No silent version conversion or production migration is enabled.
Catalog revisions and checklist IDs/content/order/state participate in the shared
snapshot and encrypted recovery, without replaying notifications or rewards.

createStructureCommands({reader,write}) opens no storage on import. It validates
live trusted actors, current object/list rights before command-cache lookup, and
again inside the owned synchronous transaction. Mutation payload and expected
revision bind the request ID; stale/conflicting requests return409. Hidden objects
return404, forbidden operations403, syntax400 and invalid tree/values422.

Admin and Members can create lists/tags; catalog changes require owner/manage
rights, and global existing-tag renames require Admin. List grants target live
Members and never widen limited roles. Child/Guest cannot create catalogs, grant
access or move across lists; Child can organize/edit owned/assigned task parents
and checklist items. This preserves limited roles without exposing catalog
administration; adult assistance is required for cross-list organization.

A section belongs to its list. Archiving moves its live tasks to Not Sectioned,
increments revisions and retains task IDs, lifecycle and rewards. A task move
requires edit plus source/destination list rights; linked trees must be detached
before cross-list moves. Task hierarchy stays in one list, rejects cycles and
depth6 or greater, and cannot broaden child visibility beyond its parent. Reads
also filter every ancestor in SQLite before returning bodies; revoked ancestor
access hides own-child data and cached mutation results. SQL NULL is denied.
Generic and retained legacy writes share structural validation. Parent completion
with open subtasks is rejected; no tree reward or new completion workflow exists.

Checklist items have server-generated IDs, a maximum200 items/2000-character
labels, and task-scoped ownership. Reordering derives rank, and retries preserve
IDs/results. Four items with one checked derive25%; even100% changes neither
lifecycle nor points. Large checklists must be split into tasks under these limits.
Catalog labels and root counts are filtered in SQL before private content returns
through the reader. Root views count each root once, excluding subtasks.

Synthetic tests and the downloaded compiled consumer must verify migration,
old-version startup, snapshot/recovery, ACL/cache revocation, tree/checklist and
existing compatibility. Cloud checks do not establish Windows2022 acceptance or
WindowsServer2019/R02; current results are in implementation-status and PR proof.

Recovery compatibility inspection validates migration identities and table columns independently of current task data. Ordinary bootstrap still rejects corrupt current trees before gateway initialization. Authenticated encrypted recovery validates the replacement tree through the shared snapshot gate, so a valid backup can repair a damaged installation; incompatible storage and corrupt replacement trees remain refused.

Archive retries authorize the live actor and owning-list management even when the section is already archived, then retrieve the committed result. A new archive request against an archived section still returns404. Same-list section moves preserve parent/child links; only cross-list moves require detachment.

The one P04-a review found0Critical/3Important/3Minor. All Important corrections have dedicated regression assertions. P04-b owns three deferred tag limitations before new UI acceptance: unused Member-created tags are discoverable only after task assignment; retained free-form Child task tags remain a compatibility exception; named tags project their IDs in the old UI until label/search/editor alignment. New catalog commands still enforce Admin/Member creation. These are interim storage-slice boundaries, not fullP04 acceptance.
