# Grouped board manual ordering (P08-b13)

Owned Kanban views using `rank` can preview and apply an anchor-based reorder
inside the priority, assignee, due-date or tag group. The internal session routes
are `POST /api/productivity/boards/grouped/rank/preview` and `/apply`.
The preview returns a server-owned reference; apply supplies its ID, expected
Task/view/board revisions and the existing request UUID. No raw rank, clock,
Task patch, or foreign group payload is accepted.

Only canonical board-position metadata changes. Task fields, revision, lifecycle,
points, reward ledger and stored notifications stay unchanged. The board revision
advances once when positions change; exact UUID replay returns the original
acknowledgement after process restart/restore while checking current authority.
Catalogue invalidation contains no private Task ID and emits no Task update.
A no-op does not consume a board revision. Rebalancing retains each Task's
physical section/workflow column. All metadata and the UUID cache share I01's
transaction; failures roll everything back before events.

Each view uses its saved filter and current owned canonical board/list grants.
Whole visible-list row/byte/tag/group admission precedes Task-body decoding.
Anchors outside the selected visible group return a private-safe 404. Preview
references are bounded by count/bytes and expire after 15 minutes; Task/view
content fingerprints, lane contents, board revision and captured local date
invalidate stale plans. Runtime time comes from SQLite's operating-system clock.

Ordering is shared by the canonical board. A Task shown under several tags has
one body and the same position in every tag projection. Changing a semantic
field to another group is still the existing independent selected-field command;
an atomic cross-group field change plus anchor move is outside this slice.
Non-rank saved sorts refuse manual ordering. No migration, default activation,
UI feature or dependency upgrade is included.

The compiled Windows consumer adds one mandatory rank proof to the previous 22
board checks, including read-only preview, unchanged Task rows, private anchors,
UUID replay and restart/restore replay. All prior assertions remain mandatory.
Read-only artifact collection parses the explicit target Git contract as data:
only the exact reviewed 22-check predecessor or current 23-check inventory is
supported. A current target cannot qualify with predecessor evidence. The raw
reader receipt must agree with the trusted target capability and contract hash.
No target code is imported or executed by the collector.

Cloud results are diagnostics only. Exact-head Windows proof is recorded in
`implementation-status.md`; Windows2022 does not establish Server2019/R02.
Full P08, P09, full P10 and later master-plan work remain unfinished.
