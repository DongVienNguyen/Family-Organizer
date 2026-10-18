# Investment tracking and valuation — W15 core

Stock/ETF tracking keeps cash, trades, eight-decimal quantities and average cost
in the shared I01 transaction. Buy/sell history is internal bookkeeping; it does
not place orders. Trade edits replay later sales deterministically, reject
short positions and retain immutable audit/once-only receipts. Current account
permissions apply before reads and cached retries; the approved Wallet Admin
manage-all policy remains intact. History pages contain at most50 rows.

Buy10×100 +fee10 consumes1010. Sell4×120 −fee5 receives475, allocates404 cost,
realizes71 and leaves6 units/cost606. Quote130 values780, unrealized174.
Starting10000 leavescash9465 and total10245. Capital deposits raise total
value without being labeled investment profit. Growth uses actual month ends,
marks pre-opening periods unobserved and missing/stale quotes unknown.

Manual quotes retain actual source date and immutable correction sequence.
An optional trusted provider is called only after explicit action, outside the
writer, with cancellation/deadline/current authority checks. Production has no
selected market provider; the UI remains usable with manual prices. No live
provider is used in tests. Stale is a documented calendar-age policy, not an
inferred holiday exchange calendar. No corporate actions/dividends/splits claim.

Explicit additive storage15/standalone snapshot16 adds catalogue, portfolios,
trades and quote snapshots. Accepted schemas1–14 remain unchanged. Snapshot
validation checks execution postings, exact Money, audit identities/revisions,
portfolio sequence, cost replay and quote provenance after transport checksum.
No automatic production migration/activation or Windows module packaging change.

Portfolio UI includes reviewed buy/sell, edit/void, quote date/source,
allocation, value/profit by period, bounded history, same-request recovery and
phone light/dark. Private financial state clears before refresh/navigation and
on denied/late reads; financial intents are memory-only and session-owned.
Source fences also catch nontrade cash and quote changes while growth yields.

## Evidence and remaining work

Source `14a25866ed9c2699ef25338dfb4de41528a11cf0`: 8350 tests/484 files, matching JUnit,
zero failures/skips/todo; all8252 W14 parent cases plus98 retained
(including the four I02 goal privacy cases). Lint/build exit0. Focused Chromium
4/4, no retries/skips/flaky outcomes; fixture15 offline/integrity/legacy/normal
stop/closed/cleaned, exact source/build bound. Phone viewport screenshots were
inspected in light/dark. Whole Wallet browser parents and Windows acceptance
are deferred to the final composed batch, not inferred from these four cases.

[Proof](evidence/w15-portfolio-development.json),
[JUnit](evidence/w15-final-full.junit.xml.gz),
[log](evidence/w15-final-full.log.gz). Earlier failed reports are retained.
Author inspection does not substitute for independent review.
PR/CI run URLs:none; backup branch `codex/feature-first-acceptance` only.

W15 remains partial until legacy Asset binding and unified net-worth exclusion
are implemented/tested under I02/W18. Existing gold/crypto/property Assets are
preserved. W16–18, remaining Productivity/M1/I02/I03/full recovery/cutover and
final Windows2022 Node22/24 package/service/browser checks remain. Actual
WindowsServer2019 R02 is separate and unrun. No release/tag/VPS access/deploy.
