# Shared reports and public reference FX — W08 core

Source `6260203a3efaf82e5515add31099e03baed37c34` adds four report metrics, current-ACL shared numeric filtering,
exact group/bucket drilldowns, internal HTTP/SDK and the Analytics UI. Wallet stays
off by default. No automatic migration/activation, dependency/lockfile/workflow
change, release/tag or VPS action is introduced.

Income/expense uses unique records; adjustments and transfer movements remain
separate. Cashflow includes income minus expense plus selected-account transfer
movement, excluding adjustments/trades. Family internal transfers net to zero;
a readable single leg remains a visible movement without revealing its private
counterparty. Cumulative series retain exact business-date buckets. Labels may
overlap groups, while grand totals count once. Category splits convert the parent
once and distribute rounded target minors deterministically to sum exactly.

Balance uses openings and the account ledger, including trade postings, independently
of category/label/kind/search/amount filters and even historical invalid split metadata.
Void postings never count; cleared/reconciled selection excludes uncleared entries.
Credit limits do not increase wealth. Accounts excluded from statistics stay out
of default totals; explicit account selection may inspect their ledger.

All money stays canonical signed64 strings/BigInt. Missing FX yields explicit
incomplete coverage and known subtotals, never fabricated zero valuations. Reports
retain actual quote dates/source and allow at most7day carry. Previous zero,
incomplete valuation or unsupported previous year yields a null growth ratio.
Dates1000–9999 follow the existing calendar contract; at most512 buckets,20k points
and100k visible posting rows are accepted. Large Windows performance is unrun.

Query captures share the current SQL account ACL and record predicate, avoid full
note/payee hydration without search and recheck authority/revisions. The ledger
projection does not decode category splits. Exact parent groups use optional
`categoryMatch:exact`; existing filters retain descendant expansion when absent.
Explicit uncategorized/unlabeled selectors make null-group drilldowns exact and
are visible in FilterPanel. SDK validates per-point and aggregate account cohorts.

Explicit storage8/standalone9 adds only immutable public USD/VND daily-rate cache.
Accepted1–7 DDL/checksum bytes stay unchanged. Earlier fixture contracts are pinned
to their actual version; default4/receipt5/bulk6/workflow7 remain separate from new
analytics8. Snapshots validate pair/source/positive exact ratio and chronology.
No cache refresh rewrites transaction FX snapshots. A nonempty historical quote
is compared byte-for-byte through native failure/retry and successful refresh.

The public adapter follows [primary docs](https://www.frankfurter.dev/) and
[OpenAPI](https://api.frankfurter.dev/v2/openapi.json); VND coverage metadata was
inspected, no actual live quote fetched. Fixed HTTPS/date endpoint, no credentials,
no redirects,5s/16KiB bounds, exact decimal JSON lexemes. Explicit Admin refresh
fetches outside I01, rechecks fresh role after await/in writer, and replays a cached
nonce before fetching. Audit failure rolls back quote/audit/nonce together.
Tests and browser runtime use only synthetic provider adapters; no real delivery
or AI/provider call occurs in tests. There is no scheduler or bank synchronization.

Session-owned Analytics fetches only when shown, retires financial results on
refresh/SSE/hide/logout, and ignores late responses. Unknown rate refresh preserves
original date/body/key above navigation with explicit retry and fresh capability
checks. Four metric tabs, Line/Bar/Area SVG, an accessible exact-value table,
pagination, vi/en/zh, theme and phone layout use existing app patterns. Charts
convert only presentation coordinates to Number. Empty/error/incomplete differ.

Cloud **7645 tests/422 files**, matching full JUnit,
zero failed/skipped/todo; all7580 parent identities plus65
retained. Lint/build exit0. Final Chromium **34/34** retains all31 parent cases
plus report/filter/drilldown, ledger/missing-rate/privacy/phone and Admin lost-ack
same-key refresh. Real Express/SQLite fixture8 is offline, integrityOK, Finance
legacy retained, normal stop/closed handles and matching build bytes.

Intermediate browser34/34 also passed, but source changed for exact category
and aggregate drilldown guards, quote-date coverage and calendar edges afterward.
Its source manifest/JUnit is retained; final rebuilt34 validates final frozen
bytes. RED/development failures are retained and explained in the proof. No
assertions/tests were removed/skipped, no retry/deadline increased, and only one
full regression ran for this source group. Author inspection is not independent
final whole-branch review.

[Proof](evidence/w08-reports-development.json),
[full JUnit](evidence/w08-reports-cloud.junit.xml.gz),
[full log](evidence/w08-reports-cloud.log.gz),
[final browser JUnit](evidence/w08-reports-browser.junit.xml),
[intermediate browser JUnit](evidence/w08-reports-browser-intermediate.junit.xml).
PR URL/CI run URL:none; backup branch:`codex/feature-first-acceptance`.
Current Windows2022/Node22, other engines/touch, performance/package/service and
actual Server2019R02 are unrun. Win2022 cannot certify Server2019. Next:W09 personal
preferences/dashboard, W10–18, remaining M1/I02/I03/master, protected restore host/
Admin binding, remediation/raw backup/legacy bridge/cutover/retention, independent
final review and batched Windows. Whole plan remains incomplete.
