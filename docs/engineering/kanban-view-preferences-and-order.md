# Kanban saved views and pure card ordering

Cloud functional checkpoint, 2026-10-17 (Asia/Saigon). Source `d481c2d1297c88b8155ef68b9a0593664cdd7a6f`,
based on `ec0eb0d90c18c28c02c58cfec80d1672fae5365a`.

Users can edit an owned Kanban view's title, grouping and sorting, plus its search,
priority and lifecycle filters. Other stored filters are preserved. Group choices
are board columns, priority, assignee, due date and, for format9 views, tag. Board
identity, mode and column configuration remain bound to the captured view; saving
preferences changes neither shared WIP nor Tasks. Cancel writes nothing.

Draft and base are separate copies. A409 requires explicit reload/rebase before
another save: user-edited fields survive, unrelated remote changes carry forward,
and the next explicit save uses the refreshed revision and a new request UUID.
An unknown send locks the original immutable body and UUID for manual outcome
checking across unrelated authorized refreshes. Receipts are checked against the
actor, view, revision and requested preferences.

Manual Workflow ordering stays within an active Task's existing lane. It uses
read-only preview followed by explicit apply; cross-lane lifecycle and completion
still belong to P10. Pending/terminal Task ordering is not exposed here. Grouped
ordering uses the existing pure rank endpoints rather than a field-change command,
so a timed deadline never becomes an all-day deadline just to change position.
Secondary tags and canonical Task identity remain intact across multi-tag visual
projections. Noncustom sorts disable manual ordering controls.

A real authenticated catalog result now publishes minimal scope IDs/permissions
synchronously before the slower pin read. Creation and view draft owners subscribe
to confirmed scope loss. This closes a race where an intermediate revoked catalog
could be superseded in React state by a fast permission restoration. Transient
refresh starts publish no revocation; unchanged rights preserve uncertain requests.
Observers carry no titles, private counts or Task data and retire with the session.

Development failures remain available. C52 exposed view-draft resurrection. The
unchanged C48 later exposed quick-add resurrection in the wider shared-store group.
Removing its view-read gate and hiding an unavailable scope passed its UI unit but
still missed the intermediate React state. Network timing showed missing catalog
responses before pin completion and restoration; synchronous authority publication
fixed the actual boundary. A separate real Task API regression caught the missing
preview request identity in the grouped-rank SDK. No assertions, retries, skips or
timeouts were relaxed.

Full Cloud verification:6300tests/341files,6300JUnit cases, zero failed/skipped/todo;
lint/build exit0. All6185parent cases remain, plus115new. Only the fresh temporary
root in five unchanged recovery-retention names is normalized; multiplicity stays
intact. Actual Chromium C22/C24/C36/C40/C44–C54 and native touch pass15+1first
attempts, offline, with DB integrity, closed native handles and fixture cleanup.
The original48 browser case bodies, touch test, offline guards, workflows,
dependencies, lockfile and migration/runtime defaults remain unchanged.

One LOCAL SELF review, not independent:28initial paths;0Critical/1Important/0Minor.
The Important issue was fixed after two correction iterations; final34paths are
verified against frozen source and bundle hashes, with no rereview claim. Raw
JSON/JUnit/log/trace evidence is retained under `/workspace/family-evidence` and
bound by [compact proof](evidence/m1-view-order-development.json).

Development branch:`codex/feature-first-acceptance`. PR URL and CI run URL:none.
The browser runner recorded the earlier HEAD while exercising the frozen working
tree and matching production bundles; this is Cloud evidence, not exact-HEAD
Windows acceptance. The full54-case inventory, Firefox/WebKit, current Windows
unit/browser/package/service and Server2019/R02 checks remain unrun. Historical
144/156-case raw reports cannot qualify the current162engine-case contract.

Continue [M1's remaining main flows](m1-feature-checklist.md), including grouped
and Workflow pointer/touch drag, pin/filtered-out/undo interactions and final UX
checks, then Wallet core and later approved milestones. Full M1/master is not
complete. No release, tag, VPS access or deployment occurred.
