# Wallet shared record query — W06 partial

Source `a243c9c36ad6f7db14d461d5e5a0f085fa8df7ad` adds a read-only list/count facade
for later API/UI and report/drilldown consumers. Current adult role/deletion and
SQL grants gate both candidate and page-body queries. No writer, command-cache
entry, runtime job or provider call is introduced.

Filters reuse W01 exact/date/AND-OR/labels semantics. Hidden historical category
descendants remain selectable; ancestry is processed iteratively. Account,
currency and amount dimensions match the same readable posting, then events are
deduplicated. matchedAccountIds identifies matching legs separately from readable
counterpart display postings. Future aggregates must use that selection rather
than summing every displayed leg. This is not a report engine yet.

Partial transfers redact note/source key/payee/payment method/labels before text
matching and output. Inaccessible rows never enter counts or returned bodies.
Every otherwise matching leg needs a valid reference valuation for numeric
bounds; missing rates or imprecise money errors explicitly. Visible malformed
income/expense signs, zero or multiple postings error instead of misclassification.

Cursor order is effectiveDate, occurredAt and native binary ID, including Unicode.
It binds current actor, normalized filter, visible revisions and matched legs.
Visible changes or grant revocation conflict; completely hidden writes do not
invalidate the cursor. Authority is checked again between candidate and body
reads. Cursor is not a bulk authorization/selection token.

Unsearched candidates omit large note/payee/label bodies. Only the selected page
loads full bodies. Page max100; more than100000readable candidate postings errors
with422 rather than returning truncated success. A synthetic10k readable +10k
inaccessible fixture returns10005visible records including initial fixtures,
loads100full bodies per page and pages200IDs without duplicates. This is functional
Cloud evidence, not Windows/performance certification.

Full Cloud6770tests/359files/matchingJUnit/0failed-skipped-todo; Wallet431/20,
query44cases; all6726parent retained. Lint/build0. LOCAL SELF2paths0C/2I/0M:
posting integrity and short-circuit valuation/matched-leg selection fixed in two
passes with RED4/RED3, then full suite; no rereview/independent claim. Initial
fixture typing lint failure is retained in [proof](evidence/w06-query-development.json).

PR/CI run URL:none. No API/SDK/UI, bulk selection, report engine or activation is
wired. Private receipts, remediation, legacy bridge/raw JSON/ZIP conversion,
parity and remaining Wallet/M1/master work stay required. Current browser,
Windows2022/Node22/package/service and actual Server2019R02 unrun. No dependency,
lockfile, workflow, release/tag/VPS change.
