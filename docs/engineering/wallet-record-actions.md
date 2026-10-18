# Record action authority and failure feedback — W04/W05/W06 partial

Source `d9e982e147fcdf8f9d0feaf5e675674657905ccf` adds an internal authenticated record-actions read endpoint.
Current record read scope is required first. Edit/void previews reuse the existing
financial write guards, including linked fees, other-creator account management,
voided records and specialized occurrence/trade restrictions. These previews are
advisory; every actual write still reauthorizes inside I01 with revision/nonce.
No separate token, integration surface or cached mutation authority is introduced.

A readable fee cannot be directly edited/voided. Its parent ID is returned for
navigation only when the current actor can read that parent; a wholly private
parent never appears in the response. SDK decoding binds flags/parent to the
requested record and discards unrelated fields. The UI combines these flags with
current local scope, rather than treating account permissions as sufficient.

If a detail/action/fee read loses403/404 after the page read, the entire stale view
is cleared and the selected ID is retired. A subsequent explicit refresh can load
the newly authorized list without repeatedly requesting the revoked selection.
A capability-read failure never falls back to local write permission. Confirmation
while revalidation is running waits for fresh state and reports a changed revision;
nonform rejection is shown inline. No request is silently applied to a different
record/revision. Unknown receipt replay still retains the same original intent.

Cloud6952tests/372files/matchingJUnit, zero failed/skipped/todo; all6935parent
retained+17 (4realHTTP,7SDK,6workspace). Lint/build exit0 and tested build hashes
match. Native Chromium12/12 includes the prior11, linked-fee navigation/restricted
buttons and a changed-record void confirmation with explicit inline failure and
subsequent fresh confirmation. Real Express/SQLite, integrityOK, normal shutdown,
legacy retained and zero real external attempts. [Proof](evidence/w06-record-actions-development.json)
and [browser inventory](evidence/w06-record-actions-browser.junit.xml) bind the
actual reports/RED regressions to all12 committed source/test paths.

Author inspection is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance` follows the user's feature-first,
batched-Windows direction. Current Windows2022/Node22, other engines/touch,
package/service and actual Server2019R02 remain unrun. Dependency/lock/workflows
are unchanged; no release/tag/VPS access/deployment. Wallet stays inactive by
default. Private receipts, legacy media policy/bridge/remediation/raw backup/
cutover, durable bulk/remaining filters, other Wallet/M1 and later master work
remain mandatory and incomplete.
