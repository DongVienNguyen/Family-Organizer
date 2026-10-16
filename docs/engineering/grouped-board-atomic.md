# Atomic selected group and order (P08-b14)

The existing internal grouped-move preview accepts optional `beforeTaskId`.
Omission retains field-only behavior. Explicit null appends to the destination
group; an ID anchors before a currently visible card in that destination group.
The owned view must use rank sorting. The server derives the destination from
the selected priority, assignee, due or tag intent, never a caller-supplied group
or numeric rank. Private, foreign and other-group anchors return404.

The shared scalar ACL admission bounds the entire visible list before decoding
Task bodies. Preview binds current Task/view fingerprints, board revision,
visible Task facts and ranks, timezone/day and authorized tag identity. Apply
rechecks grants before UUID acknowledgement and inside the existing I01 write.
It validates the retained plan and calls the canonical selected-field writer,
then writes all required rank/rebalance metadata in the same transaction.
Any failure rolls back Task/history, every affected board, positions and command
cache. Physical section/workflow membership is preserved. An effective command
advances the current board revision once; rank-only changes leave Task revision
alone, and full no-ops change neither. Other projections of a multi-tag Task
share its canonical board ordering.

A ranked move whose projected Task would leave the saved filter is refused422.
Use the existing field-only command for a move that disappears from the filter;
its existing filteredOut result remains available. This avoids pretending a
hidden destination card is positional authority. Current UUID retries still
acknowledge once after factory/process restart or a legitimate owned filter edit.

HTTP emits Task events only for actual Task changes and private-safe catalog
invalidation for either Task or rank effects. Lifecycle, approval, rewards,
notifications and completion commands are unchanged. Schema bounds remain6/9/1
with no default activation or new migration.

The compiled Windows ZIP proof adds a24th mandatory check: read-only preview,
one atomic selected-field/rank update, one board advance, private-anchor refusal,
UUID replay, and replay after ordinary restore/credential reentry, without
reward/notification replay. Its clock interval is bounded by native SQLite time.
The collector parses target Git as data and distinguishes exact22/23/24 profiles;
old reports cannot qualify a target requiring the new atomic capability.
Windows2022 CI does not constitute Server2019/R02 acceptance. Full P08 and the
master plan remain incomplete; no release/tag/VPS action is authorized here.
