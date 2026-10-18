# P13 canonical Notes and typed Task links

Production sourcef9fb698 adds explicit pilot16; fixture follow-up627b5dc changes
E2E setup/diagnostics only. Default6, frozen1–15 migrations and Windows package
caps remain unchanged. P13 files/import/export and the full master remain open.

The Task drawer and existing canonical Notes reader create a linked private
counterpart. Confirmation states that the original content/history is retained.
There is no second Notes/Markdown store or automatic synchronization. A Task with
active rewards, pending approval or active recurrence cannot convert before a
separate archive policy. An accepted past grant remains unchanged. A Note creates
a fresh unfinished Task with no default due, assignee or reward; text over the
Task body bound is rejected without truncation. Both source and destination
versions/authority are fenced, including before cached receipts. Typed links
resolve current ACL at both ends before title/count, and copied records retain
their own explicitly authorized new ownership.

The SQLite Notes path now preserves retained IDs, using the existing users
upsert pattern inside I01. DELETE/reinsert of the whole collection used to cascade
away all links on unrelated edits and restore; actual failing native reports
are retained. Deleting a Note still prunes its own links while retaining a copied
Task. The shared snapshot/inspection/bootstrap validates16 tables, native FK and
direction provenance; no replacement restore owner is introduced.

Trusted media inheritance pairs one currently authorized canonical source with
its private new counterpart and verifies current/before bindings. Generic foreign
attachment copying remains denied. Current Task/Note visibility also fences the
browser's original command/revision/key through lost ACK/navigation. The Notes
reader derives content from current props rather than retaining an old private
object. An actual revocation browser test caught a disabled stale Note label;
labels now require current peer scope before rendering.

Full8630tests532files/matching JUnit, zero failed/skipped/todo, at f9fb698; all8595
prior template-base cases plus35 retained. Lint/build0. The fixture-only follow-up
has18/18 same-source/build first-attempt Chromium journeys: content4/templates3/
notifications4/collaboration3/calendar4, offline, owned16/15/14/13/13 fixtures,
normal stop, integrity, closed handles and cleanup. Both390px themes were viewed.
One parent Member bootstrap stall and read-only diagnostics are retained; actors
now load on a fresh document before storage replacement. Privacy worker/session,
readiness, network, source-privacy assertions and deadlines are unchanged. This
is a test bootstrap change, not a claimed production auth fix.

[Raw proof](evidence/p13-content-development.json). Author review only; no new-
source PR/Windows run. Final Windows qualification must compose all parent suites
and these new harnesses; Node22/24/package/service/performance and actualServer2019
R02 remain separate. No release/tag/VPS access or PC runner.
