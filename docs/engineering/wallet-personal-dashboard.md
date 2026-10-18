# Personal dashboard, saved filters and charts — W09 core

Source `019dde5b9d58d619141bf0ab497a1cf1e4a12e86` adds personal configurations and twelve actual-data widgets,
with shared session ownership in Wallet and the existing global Dashboard.
Wallet stays off by default; no automatic migration/activation, dependency,
lockfile, workflow, release/tag or VPS change is introduced.

Owned filter/chart/layout configurations never store balances or grant finance
rights. Another Admin has no personal override. Commands use I01 revision/nonce,
no-op semantics, digest-only audits and owner-only aftercommit notification.
Native audit failure rolls back configuration and nonce. Explicit schema9/
standalone10 adds this storage while accepted1–8 SQL/checksum bytes remain.
Live commands and snapshots share bounds:32filters/32charts/1layout,65rows and
1MiB/owner,24widgets/layout,120character names. Unknown widget kinds stay retained
as unsupported placeholders, with no evaluation/provider request. Current roles,
account scope and query authority govern every actual financial read.

Summary, balance trend, cashflow, period comparison, cashflow trend, expense
structure/nature, recent records, accounts, native-currency balances, category
spending and credit utilization reuse existing authenticated endpoints. All
money/credit percentages stay exact BigInt strings; only chart coordinates use
Number. Expense cards show positive spending, while report formulas retain net.
Lists are bounded and tell users when the account list contains more entries.
There are no sample financial values in these widgets.

One refresh-generation loader coalesces identical in-flight reports. It has no
persistent/cross-user cache. Refresh/SSE/hide/logout synchronously clears results;
late payloads cannot revive them. A known authority failure clears the entire
financial view, and a final fresh account-scope/revision fence revalidates async
report, record, account and credit data before publication. Saved revoked IDs
remain configuration only and cannot expose names/numbers or create grants.

Add/remove/move/resize stages a local layout until explicit Save. Keyboard buttons
and phone single-column layout are supported. Unknown save keeps original body,
revision and key across navigation. Stale remote revisions keep local edits and
require explicit reload; saving a separate filter never discards dirty layout.
Modal names, archive/restore, saved filters and selected chart style use existing
FancySelect/useModalA11y/useConfirm, theme and vi/en/zh patterns. Global Dashboard
drilldown shares navigation so Finance opens the exact filtered Records view.

Comparison supports previous equal-length and prior-calendar-year periods, with
leap-day clamping and unavailable prior years. The report week bucket clamps
before ISO conversion at the upper calendar boundary. Book balances value FX at
min(bucket end,report business asOf), avoiding falsely stale quotes at a future
month end; ledger horizon and transaction FX snapshots remain unchanged.

Cloud **7704 tests/427 files**, matching full JUnit,
zero failed/skipped/todo; all7645 parent identities plus59
retained. Lint/build exit0. Final Chromium **38/38** retains all34 parent cases plus
layout/keyboard/reload/phone/global drilldown, saved filter/chart scope, unknown
same-key layout retry and real SSE grant revocation. Real isolated Express/SQLite
fixture9 reports integrityOK, Finance legacy retained, normal stop/closed handles,
zero external calls and matching build bytes. Older fixture4–8 contracts remain.

First browser36/38 failed in two new test setups. DOM/calllog showed a repeated
helper closing an already-open filter and an exact account-text expectation
omitting rendered “· VND”. The helper now opens only if needed; new exact text
matches the complete DOM. All financial/current-authority checks, parent cases,
assertions, deadlines and retry policy remain. First failed JUnit, DOM/trace and
screenshots are retained. Native snapshot quota hardening changed source after
the first build; final rebuild38 qualifies final frozen bytes. Only one full
regression was run for this source group. Author inspection is not independent
final whole-branch review.

[Proof](evidence/w09-dashboard-development.json),
[full JUnit](evidence/w09-dashboard-cloud.junit.xml.gz),
[full log](evidence/w09-dashboard-cloud.log.gz),
[final browser JUnit](evidence/w09-dashboard-browser.junit.xml),
[first failed browser JUnit](evidence/w09-dashboard-browser-first.junit.xml).
PR URL/CI run URL:none; backup branch:`codex/feature-first-acceptance`.
Current Windows2022/Node22, other engines/touch, large performance/package/service
and actual Server2019R02 remain unrun. Next:W10 imports/undo, W11–18 and remaining
M1/I02/I03/master, protected restore/remediation/raw legacy backup/bridge/cutover/
retention, independent final review and batched Windows. Whole plan incomplete.
