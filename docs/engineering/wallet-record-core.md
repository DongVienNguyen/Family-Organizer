# Wallet record core — W05 partial

Source `6837a52a20810ab7041ef3577a665054d8055e65` adds manual income/expense/
adjustment, balanced/external/FX transfers and separate linked fee expenses. All
money remains exact minor strings/BigInt. Current actor/grants are checked before
idempotency lookup and inside I01. Creation trusts server UUID/actor/time; edits
preserve creator/source, enforce revision and audit monetary before/after.

The approved1m/2m fixture ends Cash1m/Bank2.3m after income500k, expense200k and
transfer300k. FX100USD→2.5mVND retains both amounts; a10kVND fee is an expense.
Native second-post, fee-audit and parent-void faults roll back money, metadata,
audit and receipt. Actual I01 restore rewinds cache and state together: a restored
void UUID executes again once rather than returning a stale pre-restore result.

Existing fees retain their own date/status/review/payee/labels. Parent notes do
not clear/revive a fee or add a child revision. Fee edits use the parent revision;
removal voids/unlinks while retaining history. A voided fee must be removed before
adding a new charge. Archived old legs remain historical; new parent/fee legs
cannot use an archived account merely because another leg used it previously.

Account currency stays locked after its last current posting moves elsewhere,
because the original posting remains in monetary audit. Old heterogeneous audit
objects are handled safely. Imported FX quote source survives metadata edits;
changing quote currencies/rational/as-of records a manual correction. Live text
stays lossless; audit retains text SHA256/length plus monetary/classification
before/after rather than duplicating large free text. It cannot undo old text.

Final Cloud6586tests/351files/matching6586JUnit/zero failed-skipped-todo; lint/build0.
All6539parent cases remain+47. Wallet247/12files run in full suite; targeted records
47/2files passed. Initial6585unit run passed but lint failed TS2339, so build did
not run. Final source fixes that and the Important FX-source review finding via
RED→GREEN/full verification. LOCAL SELF4paths0Critical/1Important/0Minor, one fix
pass/no rereview, is not an independent review. Development failures are retained.

[Proof](evidence/w05-record-command-development.json) binds frozen bytes and raw
reports to this source. This is Cloud working-tree qualification, not exact-HEAD
Windows CI. No PR/run/browser check was created. Current Windows2022 Node24/Node22,
package/service and Server2019R02 remain unrun.

No HTTP/UI/activation/legacy cutover was added. Existing finance still operates.
W03 migration/adapter must preserve legacy single-kind type edits; full W05 split/
owned schedule/debt/goal/trade integration remains pending. Those records require
their specialized workflows. W02 entities/private receipts, W04 authorized routes/
media, W06UI/bulk and later Wallet/M1/master gates remain unfinished. No provider
or notification calls, dependencies/workflows, release/tag/VPS changes.
