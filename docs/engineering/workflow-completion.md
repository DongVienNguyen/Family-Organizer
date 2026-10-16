# Workflow completion: development scope

P08/P09 reuse the P10 completion owner for a Done intent. A Workflow preview is read-only and actor-owned, binds current Task/view/board revisions and expires after15minutes. Review remains a derived destination. Section columns named Done continue to classify work without completing it.

The internal session-authenticated workflow apply command owns one namespaced I01 transaction. A private synchronous writer adapter lets the existing P10 command reuse that exact handle; it opens no nested public transaction and writes no second receipt. The normal canonical writer updates positions and enforces WIP against the actual resulting column, including pending Review. Faults roll back Task, positions, points, notifications and command receipt together. Child completion uses its current Task authority and acquires no list-management authority.

An exact UUID replay rechecks current view/board/Task access; stale new requests and missing/expired previews refuse. Successor references are projected through current ACL in the response; trusted SSE retains internal IDs separately. No reward/approval policy is duplicated in the workflow projection or client.

The UI confirms intent and optional proof, then reloads authoritative facts. Pending Review never renders a completed checkmark. Unknown transport outcomes retain the original proof/UUID for an explicit retry, with no automatic retry; current authority denial clears confirmation data. Cancellation before apply writes nothing.

Current scope is explicit Workflow completion by confirmation/menu. Other transitions, pointer/touch drag, remaining Kanban UX and full M1 acceptance remain pending. No migration/default activation/dependency/public API credential change, release/tag/VPS action or Server2019 acceptance is implied. Test reports, source/PR/HEAD/CI evidence and remaining work are tracked in implementation-status.md and evidence files.
