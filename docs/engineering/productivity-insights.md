# Productivity Insights and weekly review (P16)

Explicit pilot22 adds structured Task state events and private review snapshots. The existing I01 writer records events with the Task mutation; no initial history is invented and no reward, Task, Habit or Wallet effect comes from a report/note. Default6 and Windows package caps13 stay unchanged.

Root counts and accepted completion episodes are distinct. Pending approval does not count as completed. Missing starts/creation dates stay unknown and show coverage; Q2 Focus uses the owner session start classification. Workload card counts and the owner’s effort estimate coverage are separate.

The Task toolbar opens Tổng kết tuần lazily. Choose an inclusive start/exclusive end and timezone, inspect Q2/blocked/overdue/unassigned/review roots, and open their actual source. The existing Calendar preview/confirm flow can propose a timebox; its default does not change the deadline. Reports do not allocate rewards or score family members.

Review notes belong only to their session owner, including against another Admin. Captured Task membership, event cutoff and own Focus facts freeze data. Current Task/ancestor ACL is reapplied before decoding/counting: revocation redacts labels/counts; later grants require explicit recapture. Content edits retain the original capture unless the user explicitly requests recapture. Immutable revision facts survive backup; the UI shows the latest100 text revisions.

Private free-text drafts and original unknown commands live above the views, survive Calendar navigation and unrelated source refreshes, and clear at logout. A stale edit keeps its revision and words until an explicit review action. Late joined reads are fenced on invalidation. Summary export re-reads authorized data and checks the generation before creating a download; no internal watermark or captured membership is exported. Planning previews stay separate from confirmed writes.

Cloud development proof is in [p16-insights-development.json](evidence/p16-insights-development.json):76 targeted tests/10 files with JUnit, lint/build0, four new Chromium journeys plus four existing Calendar journeys, and inspected390px light/dark images. The first browser fixture failure and earlier native REDs are retained. This is targeted functional evidence, not a full-suite or Windows qualification. A composed full suite and Windows/three-engine/package/service/performance/pilot checks remain pending with P17–P18/W18/I02/I03. Server2019 remains R02, unrun. No release or deployment.
