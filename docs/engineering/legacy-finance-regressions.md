# F09-b — legacy finance and shared shopping regression

This slice preserves existing financial entry/budget/bill/savings/debt/asset
behavior. It adds no Wallet accounts, new features or external integrations.
Real loopback HTTP, native sessions and SQLite run on isolated synthetic fixtures;
jobs/providers are not started and no production secrets or data are used.

Four deterministic regressions reproduce SQLite UNIQUE failures when distinct
financial entries, budgets or recurring bills share a millisecond, including
bill payment beside an existing entry. New IDs retain their historical prefixes
and add UUIDs inside the existing I01 command callback. Old IDs remain unchanged,
and retries return the original ID/result before another UUID is generated.

The initial test clock was set before issued session timestamps, correctly
causing auth401. That fixture error was corrected before recording the four
product regressions; it is not reported as an authentication defect.

| Existing behavior | Regression owner |
| --- | --- |
| Financial CRUD; creator/time retained on another adult edit | server/legacyFinanceHttp.test.ts |
| Same-millisecond distinct entries/budgets/bills/payments | server/legacyFinanceHttp.test.ts |
| Budget category upsert and next-month carry without duplicate limits | server/legacyFinanceHttp.test.ts |
| Bill payment creates one expense and advances its next due date | server/legacyFinanceHttp.test.ts |
| Savings contribution history survives edit; no implicit transaction | server/legacyFinanceHttp.test.ts |
| Debt payment history/settlement/removal; no implicit transaction | server/legacyFinanceHttp.test.ts |
| Asset CRUD and original creator retained | server/legacyFinanceHttp.test.ts |
| Child/guest read and write denials for all six financial collections | server/legacyFinanceHttp.test.ts |
| Request replay retains ID/rows/logs; changed payload returns409 | server/legacyFinanceHttp.test.ts |
| Cross-actor shopping edit/purchase/clear seen by all roles | server/shoppingHttp.test.ts |
| Missing finance suite rejects CI evidence | tests/evidence.test.ts |

This resolves the cross-actor HTTP Minor deferred by the F09-a review. Targeted
verification168 tests/3 files; full frozen source1872/104, zero failed/pending/todo,
lint/build0. One concurrent Cloud full run had1871 passed/one15s GC child timeout;
isolated GC completed4.2s and full serial1worker passed without changing timeout,
probe workload or assertions. Fresh review and exact-HEAD Windows still pending. Existing browser18 flows are retained; this slice
does not yet add financial UI smoke. Remaining legacy UI/domain rows, Caddy,
full F08 collector/promotion, F05 enforcement and Server2019 acceptance remain.

One fresh review found0Critical0Important1Minor: bill-payment replay coverage was
missing at the fourth UUID site. The corrected test repeats the same command,
requires identical response/transaction ID and whole SQLite state/logs, and one
due-date advance. A different target bill with the same command must409; ignored
request metadata retains the same cached result. This is a coverage correction,
not a newly demonstrated product defect. Final rebased full source/Windows required.

After provisional rebase onto F07-l e79, reviewed finance/HTTP/gate source bytes are
unchanged. Frozen Cloud1942/105,169 target/3files, lint/build0 now pass. Earlier
serial1933/1934 GCfailure remains recorded. F07-l supplies stronger controlled
heap pressure while retaining300000 SQL assertions and15s; finance adds no runtime
flags. Final main rebase and exact Windows remain mandatory after PR38 acceptance.
