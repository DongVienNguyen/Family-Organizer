# Wallet debt and savings links — W13

Wallet remains opt-in. Explicit schema 13 (standalone snapshot 14) adds coordinated
links to the existing Debt and SavingsGoal objects. Accepted schemas 1–12 are
unchanged. Importing the service does not initialize storage, activate Wallet,
start jobs or contact a provider.

## Money and cashflows

Borrowed principal is a transfer reducing the tracked liability; interest is an
expense. A lent repayment is an incoming principal transfer and separate interest
income. Principal never becomes consumption or artificial income. A reconciled
explicit liability/receivable account can be bound to one debt; later payments
retain its binding. The service refuses to invent an opening balance.

New links write exact `Money` strings into the existing payment/contribution
history through the same I01 transaction as the ledger, audit and nonce receipt.
Original numeric histories remain readable and unchanged until explicitly linked.
Existing legacy parents use VND; incompatible currencies, unsafe legacy amounts
or ambiguous histories require reconciliation. This is not multi-currency loan
origination. Existing legacy numeric withdrawals remain available; new Wallet
goal contributions are positive. Coordinated withdrawal parity remains a cutover
gate, not an implemented signed contribution API.

An existing principal transfer or interest-only record can be linked without a
second cashflow. A combined imported expense/income can be reclassified into its
principal transfer and separate interest, preserving total cash, original ID,
source/import provenance, memo, payee, payment method and labels. Existing category
splits cannot be silently discarded; the user must reconcile them first. A
schedule-linked record cannot enter an unrelated three-way financial link.

A goal allocation earmarks existing available funds. It creates neither a ledger
record nor another income/asset. Strict capacity subtracts live earmarks. A goal
transfer uses the existing atomic two-leg command, conserves account-book wealth
and may link a complete existing transfer, including its fee, without moving cash
again. Detached allocations release capacity when their legacy history is removed.
A kept cashflow with a live tracking entry cannot count toward a second payment
or contribution.

## Coordinated edit, unlink and privacy

Parent hashes and link/record revisions detect conflicts inside the current
transaction. An edit updates the same history row, principal/interest records,
audit, totals and nonce together. Removing a role voids its old record; adding it
creates a new audited record. Transfer fees and original ledger metadata survive
an edit. Fault injection verifies that all changes roll back together.

Ordinary record edits/voids and legacy destructive edits cannot detach an active
link. Explicit unlink policies differ:

- **Keep:** preserve ledger and tracking history, release edit protection. Later
  legacy history removal does not delete ledger money.
- **Void:** void linked ledger records and remove their tracking entry together.

Current session role, parent privacy and every account/record/fee leg are checked.
Another Admin cannot read a personal goal or bypass private account permissions.
Legacy goal reads and all mutation receipts apply the same contribution projection.
Uncertain commands retain immutable body/key in session memory above navigation;
views are cleared on hide, refresh, logout and disposal. Late reads must pass both
fresh account scope and fresh parent visibility/hash checks. A failed privacy
fence clears lists and detail together. No financial queue is persisted offline.

## User flow and acceptance scope

Planning contains target selection, new or historical tracking entries, source
and optional counter-account, exact principal/interest or goal amount, date,
annotation and strict allocation policy. A bounded same-day record chooser reads
full record/fee permissions. Preview displays the incremental source cash change,
including zero for an already-recorded complete payment. Explicit confirmation
precedes save, keep or void. Existing Debt/SavingsGoal cards and history rows
navigate to current authorized Wallet views. Việt/English/中文, phone layout,
light/dark and inline reconciliation states use the existing design system.

Malformed or overflowing mixed legacy totals show reconciliation, never a rounded
or fabricated zero. The old Finance net-worth dashboard is still a legacy-book
projection: it is not a unified valuation of both books. I02/W18 must reconcile
legacy balances, linked debt accounts and portfolio valuation before canonical
cutover; these account-book conservation tests do not establish that global gate.

Full shared restore/retention, history pagination, canonical migration/bridge,
nonblocking import and Windows package schema qualification remain W17/W18/I03.
Windows 2022, Node 22, clean package/service, other browser engines/touch and actual
Server 2019 acceptance require their own evidence. No release/tag/VPS action is
authorized or performed by this feature.

## Verification

Source `47f4ade4fd9c610741e69b6c8ed620f40a24e4b8` binds all 49 frozen source/test/script inputs.
Cloud: **8128 tests/463 files**, matching full JUnit,
zero failed/skipped/todo; all 8024 parent cases plus 104
retained with multiplicity. Lint/build exit 0. Final Chromium **52/52**, all 48
parent cases retained, zero retries/skips/flaky cases. Fixture 13 is offline,
integrity OK, legacy Finance retained, normal stop, closed/cleaned and build-bound.
Phone light/dark and actual legacy navigation/overflow handling are included.

Earlier browser and failed development/lint reports are retained. The initial
three failures were a helper refresh-label mismatch; a later diagnostic exposed
an achieved-badge selector assumption. A zero-test diagnostic grep also failed
and is not counted as acceptance. Financial assertions and budgets are unchanged.
Full aggregate and browser runs are staged on this four-CPU Cloud host.
Author inspection is not independent whole-branch review.

[Proof](evidence/w13-financial-links-development.json),
[full JUnit](evidence/w13-financial-links-cloud.junit.xml.gz),
[full log](evidence/w13-financial-links-cloud.log.gz),
[final browser JUnit](evidence/w13-financial-links-browser-final.junit.xml.gz).
PR URL/CI run URL: none; backup development branch only. Windows 2022/Node 22/
package/service/other engines/touch and actual Server 2019 R02 remain unrun.
Next: W14 budgets/forecasts, then the remaining approved scope above. No release/tag/VPS.
