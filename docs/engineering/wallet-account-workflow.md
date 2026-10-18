# Wallet account workflow — W04/W05/W06 partial

Source `877c58b640e7801a43b214241e60e12b93c69300` adds the account workspace inside Finance. It is shown only after
the existing internal Wallet status/ACL gate is ready. Wallet remains inactive by
default; the native browser fixture explicitly enables only its isolated synthetic
installation. No production activation, migration or legacy bridge is introduced.
Existing Finance transactions, budgets, bills, debts, goals and assets remain.

The UI lists current readable accounts, preserves archived history, shows exact
book/cleared/credit debt/limit/available values, and creates/edits/archives/restores
accounts through the existing session API/I01. Unknown credit limits remain blank.
Opening amounts support negative signed64 minimum and values above Number precision;
all amounts stay canonical integer strings/BigInt. Form parsing follows its pinned
input locale even if the display language changes. Default business date uses
Asia/Ho_Chi_Minh; configurable Wallet preferences remain later work.

One memory-only owner lives above Finance tab navigation and retires on the real
browser session boundary. Pending/unknown financial requests keep their exact
frozen payload and request ID, block a new command, and retry only on explicit
user action. Closing the form retains the request; the user can return and resume
its draft. A later rejected retry does not prove that the original attempt never
committed. There is no automatic retry, token store or persisted offline queue.
Conflicts retain the draft and require explicit reload before another edit.
Archive/restore confirmations bind the originally selected account ID/revision.

Permission invalidation clears public money, details and form synchronously before
fresh reads; the view never exposes a cached monetary command receipt. Native SSE
grant revocation and actual cross-tab logout are exercised. Read-only accounts show
no edit/archive action. Controls reuse FancySelect, useModalA11y and useConfirm;
Vietnamese/English/Chinese resources retain all prior content. Light/dark screenshots,
phone date/selector/focus handling and exact fractional USD are verified.

Cloud: 6860 tests/366 files/matching JUnit, zero failed/skipped/todo. All 6824 parent
cases remain, with 36 added cases (13 form, 7 command, 14 workspace, 2 native fixture).
Lint/build exit0. The final build bytes match the actual browser-tested build.
Chromium: 7/7 native browser cases, no flaky/skipped, real Express/SQLite, integrity
OK, original Finance file retained, normal shutdown/closed handles and zero real
external attempts. Reports and screenshots remain in the Cloud evidence directory;
[compact proof](evidence/w06-account-workflow-development.json) records hashes and
[small JUnit](evidence/w06-account-workflow-browser.junit.xml) retains the browser
case inventory. Failed development runs/traces remain preserved separately.

This is an author inspection of 22 paths, not independent whole-branch review.
Current PR/CI URLs: none; backup branch `codex/feature-first-acceptance` follows the
user's feature-first/batched-Windows direction. Windows2022/Node22, Firefox/WebKit,
native touch, package/service and actual Server2019 R02 have not run for this group.
Dependencies/lock/workflows are unchanged; no release/tag/VPS access/deployment.

W06 is incomplete: record forms/list/filter/bulk and durable selection remain.
This account section is an incremental placement; Accounts/Records tabs follow
with record UI. Grant editing UI, private receipts, legacy bridge/remediation/raw
backup conversion and cutover remain mandatory. W07–W18, unfinished M1 and later
master milestones are not waived or marked complete.
