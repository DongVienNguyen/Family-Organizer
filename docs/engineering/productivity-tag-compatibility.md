# Tag compatibility — P04-b2

Explicit productivity migration3 adds durable tag ownership while retaining the
accepted schema1/2 SQL, columns and checksums. Startup reads supported1..3 without
upgrading; unsupported4 or changed identities/schema refuse before bootstrap DDL.
Migration copies only recorded catalog creation revision1 from committed commands
with existing user/tag identities. Unknown legacy ownership remains unknown; it
is never guessed from rename, task creator, tag text or unrelated cached results.

A live Member discovers its unused owned tags; Admin can read the full catalog.
Associated visible tasks also make their tags readable, using the existing
ancestor/list ACL in SQL. Role/grant changes narrow reads; a role downgrade removes
private unused-owner discovery. Catalog changes invalidate permitted readers,
including an unused tag's creator, without sending labels or IDs in SSE.

New catalog creation belongs to Admin/Member. Both canonical task commands and
retained task writers reject missing tags for Child/Guest and hidden existing tag
references, before cache and again under the gateway. Existing visible tag IDs
remain selectable. Adult retained free-form tags acquire ownership in that same
transaction. Historical schema1/2 behavior remains readable until explicit upgrade.

Stored canonical and legacy relationships retain tag IDs, including original
provenance. The old task UI displays/searches current visible catalog names and
maps edited names back to existing IDs. Unchanged drafts preserve their IDs after
rename; ambiguous visible duplicate names refuse a new association while keeping
an unchanged group intact. Global task search projects only authorized labels.
Catalog refresh clears labels immediately, sequences responses, and uses the
existing session boundary; changing the session remounts all private React state.
The shared drawer and real canonical keyboard/phone acceptance follow P04-b3.

Ownership survives the shared snapshot/encrypted restore. User ownership is a
semantic reference validated against snapshot users, without a SQLite FK into the
legacy users collection: the existing owner replaces that document table during
restore. The tag reference retains its native FK. Restore remains same-version:
restore a v1/v2 backup into that version, explicitly upgrade, then create a v3
backup. A backup is never silently converted into another target version.

Package bounds are1..3. The compiled consumer starts v1 and v2 and verifies their
table/migration inventory is unchanged; it then uses a trusted synthetic upgrade
and proves current ownership/checklist/catalog, semantic HTTP, restart, snapshots,
encrypted repair, DELETE-journal byte-preserving refusal and closed native handles.
All tests are synthetic/offline. Cloud Linux checks do not establish Windows or
Server2019/R02 acceptance; exact Windows evidence is required before merge.

FullP04/P05, rollout/P18, release/tag and VPS acceptance remain pending. The runtime
and dependency pins are unchanged; no new bank/provider/integration surface exists.
