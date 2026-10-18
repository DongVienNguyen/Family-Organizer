# Categories and labels — W07 partial

Source `7e871b91920f36f6922507bc7b49855f0b10f7fa` adds Admin-managed shared category/label definitions and a
session-owned Catalog tab. Member reads and record selection remain available;
Child/Guest/deleted actors remain denied. This follows the existing Admin-only
legacy category mutation policy. No activation, migration, dependency, lockfile
or workflow change is introduced. Wallet remains off until rollout gates pass.

New/reparented subtrees support up to three levels and reject cycles/unknown
parents; metadata-only edits preserve accepted deeper imported history. Names
are unique among siblings (or globally for labels) after NFKC/trim/lowercase;
existing duplicates are not rewritten. Revisions, original provenance, no-ops,
I01 nonce receipts, audit and postcommit-only SSE are preserved. Native audit
failure rolls back catalog, metadata, cache and idempotency state for same-key retry.

Hiding or archiving an ancestor removes descendants from **new** record and bulk
choices, while complete definitions and retained record associations remain for
history. Records keep money/postings and previous hidden/archived selections.
The existing explicit legacy migration retains custom category mappings; physical
deletion refuses those historical links. Canonical legacy mutation/cutover wiring
is still pending and must precede activation.

Deletion is a separate read-only preview plus explicit confirmation and a fresh
I01 revision/reference check. Children, records, allocations and migration history
block physical deletion; the UI explains archive instead. Only fully readable
records contribute visible reference counts, including two-ended transfer ACL.
Protected associations reveal a flag without IDs, names, money or a hidden total.
Router and SDK accept only the bounded reference shape; unexpected private fields
are dropped from errors. Successful deletion has a compact same-key replay even
after the row is gone. Current Admin authority is checked on replay.

The Catalog tab supports complete-catalog search, pages of at most100 items,
name/nature/parent/icon/color, hide/archive, linked-reference preview and confirmed
delete. FancySelect, shared focus/scroll modal ownership, useConfirm, inline errors,
theme tokens and vi/en/zh are reused. Parent options exclude the edited subtree
iteratively, including deep imported trees. There is no new FAB or native select.

One memory-only owner survives Finance/tab navigation. A lost acknowledgement
retains the exact command payload and nonce and permits only explicit same-request
retry; a later denial cannot prove the first write did not commit. Stale revision
requires explicit reload, while duplicate-name rejection permits name correction.
Permission refresh synchronously clears public definitions, drafts and reference
counts. Member capability hides management; the actual session boundary destroys
pending data and ignores late results. No localStorage/offline write queue is added.

Cloud qualification: **7426 tests/404 files**, matching
full JUnit, zero failed/skipped/todo; all 7354 parent identities plus
72 new tests retained. Lint/build exit0. Chromium **23/23**, retaining all
19 parent cases plus tree/depth/history/themes/phone, linked deletion, lost label
acknowledgement and Member read-only journeys. The real isolated Express/SQLite
fixture reports integrityOK, preserved legacy Finance, normal stop/closed handles
and zero external attempts. Browser build hashes match actual built bytes.

Earlier targeted failures are retained: missing new module (RED), a missing
Vitest describe import, and a TypeScript i18next options type mismatch. Fixes
preserve assertions and use a plain options object. No retries, skipped cases,
continue-on-error or deadline increases were used. The first native browser run
was22/23: DOM showed the component-local kind had reset to category after
navigation while the unknown label intent survived. Kind now belongs to the
session owner, with a dedicated regression. A separate RED test also caught stale
deletion previews on kind/editor changes. Both fixes retain all browser assertions,
selectors and deadlines. [First failed JUnit](evidence/w07-catalog-browser-first.junit.xml)
and original DOM/trace/screenshot hashes are retained. Author inspection of the25
paths is not the final independent whole-branch review.

[Proof](evidence/w07-catalog-development.json),
[full JUnit](evidence/w07-catalog-cloud.junit.xml.gz),
[full Cloud log](evidence/w07-catalog-cloud.log.gz),
[browser JUnit](evidence/w07-catalog-browser.junit.xml).
Raw development and qualification logs are hash-indexed in the proof; full local
browser artifacts are preserved at `/workspace/family-evidence/w07-catalog-browser-qualified-artifacts`.

PR URL/CI run URL:none; backup branch `codex/feature-first-acceptance`.
Current Windows2022/Node22, other engines/native touch, large performance and
package/service acceptance remain unrun. Win2022 cannot certify Server2019R02.
W07 templates/clone/split, receipt restore protected host/Admin binding, remediation,
raw legacy backup/bridge/cutover/retention and remaining Wallet/M1/I02/I03/master
work remain. Final review and Windows are batched after the coherent core group;
no release/tag/VPS action was taken. Full plan is incomplete.
