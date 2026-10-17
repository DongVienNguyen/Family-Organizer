# Wallet record workflow — W04/W05/W06 partial

Source `a41b1bd8730b1d7a73170b235b3f3af25a52a49d` adds Accounts/Records tabs inside Finance, an exact-money record
form, scoped list/detail and shared query filters. Wallet remains inactive by
default; only the isolated native browser fixture enables its synthetic pilot.
No production migration/activation, legacy writer bridge or provider is added.
Existing Finance budgets, bills, assets, debts/goals and transactions remain.

Income/expense use positive amounts; adjustments may be signed. Transfers are one
intent with two explicit amounts/currencies or one external ledger counterpart.
A reduced manual FX ratio is derived from the two entered amounts; a note-only
edit retains the original rounded quote. Fee amount/category/note are independent;
unchanged fee patches are omitted so a parent edit cannot silently delete or
replace a hidden fee. Visible fee details are required before editing their fields.
Server I01 still owns revision, audit, atomic posting/fee and replay authority.

Business date is separate from optional occurrence time. Unknown historical time
stays null; milliseconds and original overlap instants survive edits. A nonexistent
local time is rejected, a repeated time requires explicit earlier/later choice,
and an explicit new choice overrides preservation. Named-zone conversion handles
half-hour transitions and skipped dates without the host timezone. Reviewed state
preserves an existing timestamp or records an explicit new review.

The session owner retains drafts and frozen command payload/nonce across tab and
SSE refreshes. Conflicts require explicit reload; save-and-add resets only after a
successful receipt. Unknown mutation retries are explicit and keep the same key;
a failed read/filter can recover without discarding that unresolved intent.
Public views clear financial bodies before permission revalidation, omit command
receipt bodies, and purge private filter text/account selections on session end.

The catalog read route returns family-wide adult definitions, including historical
hidden/archived choices, never account balances/record bodies. Missing metadata
fails rather than silently dropping a definition. The SDK validates bounds,
duplicates, timestamps and parent/cycle integrity; new financial selections remain
server-authorized. This is a prerequisite, not W07 CRUD/tree/template/split delivery.

Current filter controls cover business period, search, accounts/categories/labels,
transfer mode and absolute amount/reference currency. The shared backend supports
further dimensions; their controls/preferences and durable selection/bulk remain.
Unchecking the last facet returns to all choices. Missing valuation is explicit
RATE_UNAVAILABLE with a default-filter recovery action. Native filter expansion
survives refresh instead of disappearing while editing.

Cloud:6935 tests/371 files/matching JUnit, zero failed/skipped/todo; all6860parent
retained+75. Lint/build exit0; production build bytes match the actual browser run.
Chromium11/11 includes the prior7account/security cases plus income/expense,
exact occurrence milliseconds, save-and-add, FX+fee and parent void, filter
valuation recovery, and conflict/lost-ack same-key record edit. Real Express/SQLite,
integrityOK, normal shutdown/closed handles, original Finance retained, no real
external attempts. [Proof](evidence/w06-record-workflow-development.json) records
raw-report/source hashes and preserved RED/DOM-driver evidence;
[browser JUnit](evidence/w06-record-workflow-browser.junit.xml) retains all11names.

Author inspection24paths is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance`, feature-first/batched Windows.
Current Windows2022/Node22, other engines/touch, package/service and actual
Server2019R02 have not run. No dependency/lock/workflow/release/tag/VPS change.

Next refine authoritative record action capabilities and nonform error feedback
(linked fee edits are currently restricted by the server), then durable bulk and
remaining filters. Private receipt storage/ACL, legacy bridge/remediation/raw old
backup conversion/cutover, W07–W18, unfinished M1 and later master milestones remain
mandatory. This does not complete W05/W06, Wallet or the master plan.
