# Filtered budgets and explainable forecasts — W14

Wallet remains opt-in. Explicit schema 14 (standalone snapshot 15) adds personal
budget definitions, immutable carry receipts and durable threshold claims.
Accepted migrations 1–13 are unchanged. Service imports do not prepare storage,
activate Wallet, start a scheduler or contact a provider.

A budget measures nonvoid expenses through the existing report engine, including
category allocations, account scope, labels, historical FX and valuation coverage.
Transfer principal is not consumption; its actual or projected fee is an expense.
The family group total deduplicates record/account/category allocation cells;
individual overlapping budget totals must not be added together.

The UI distinguishes actual spending, actual remainder, unpaid planned spending,
estimated additional other spending and expected remainder. For a 1,000,000 VND
limit, 600,000 actual and 250,000 unpaid plan, these are 400,000 actual remainder
and 150,000 expected remainder. Paid linked schedules are not counted twice.
Historical estimates require three fully observed, closed calendar months with evidence,
exclude identifiable paid schedules and subtract other expenses already booked.
Missing history is insufficient data, never an invented zero.

Account balance forecasts cover the current month or the following eleven months.
They start with the known ledger through the target end, include pending obligations
through that end (including overdue pending items), and optionally estimate other
monthly income and expenses from three observed months. They expose method,
sample count, formula and assumptions. Future FX uses the current cached observation
and retains its original date. Missing rates or lost sources produce incomplete
coverage and unknown totals. No forecast creates a posting or materializes a future
occurrence.

Carry applies once from a closed month into the adjacent month. The default is no
carry; positive-only clamps negative remainders to zero, while signed carry requires
explicit selection. The review UI shows the actual source and proposed amount.
Its source fingerprint binds the current financial policy, effective account scope,
ledger revisions and valuation evidence. A source change before confirmation
requires another preview. A committed receipt, including a zero receipt, remains
immutable under another request key. Historical source permissions are checked
even after the current definition changes. Currency or timezone changes after
carry require a new budget. Carry changes budget capacity, never cash balances.

Alerts default to 80% and 100%, once per threshold, month, recipient and financial
policy revision. Renaming does not reset that revision. Definition, audit, command
receipt, threshold claim and job reference share I01. Existing AppJobs leases,
restore epochs, FamilyDB inbox/outbox and private events handle delivery; there is
no separate timer or connection. Read/count/delivery checks repeat current role,
ownership and current/historical source permissions. Obsolete, archived or no-longer
reached alerts are not delivered. Tests use offline adapters and synthetic data.

Planning contains the budget editor, report, carry preview, distinct group total
and account forecast in Vietnamese, English and Chinese. Explicit empty scopes
mean no items. Money remains canonical signed-64-bit strings. Unknown command
outcomes keep their immutable body/key in session memory above navigation;
private views clear immediately on hide, refresh, loss of access and disposal.
Late reads recheck account scope and budget revision before painting. There is no
persisted offline financial queue.

Legacy budget routes remain in place for the later canonical bridge and cutover.
This development implementation does not prove unified legacy/Wallet totals,
production activation, Windows package/service qualification or Server 2019 R02.

## Development evidence

Source `87155f887f0072bfe644af3aa5d0ec2d1ef41ac4` binds all 50 frozen source/test/script inputs.
Cloud: **8252 tests/475 files**, matching full JUnit,
zero failed/skipped/todo; all 8128 parent cases plus 124
retained with multiplicity. Lint/build exit 0. Final Chromium **56/56**,
all 52 parent cases retained, zero retries/skips/flaky cases. Fixture 14 is offline,
integrity OK, legacy Finance retained, normal stop, closed/cleaned and build-bound.
Phone light/dark, unknown carry replay and distinct overlap totals are included.

The earlier full development run (8251/475 before the future-history correction),
all failed development/lint reports and the zero-test diagnostic remain preserved.
Author inspection is not independent whole-branch review.

[Proof](evidence/w14-budgets-development.json),
[full JUnit](evidence/w14-budgets-cloud.junit.xml.gz),
[full log](evidence/w14-budgets-cloud.log.gz).
PR URL/CI run URL: none; backup development branch only. Final Windows
qualification and Server 2019 R02 remain unrun. Next: W15 and remaining scope.

Whole-element phone captures were clipped by the scroll container and are retained
as diagnostics. A separate 1/1 viewport check on the same source/build produced
visually inspected [light](evidence/w14-budget-viewport-light-report.png) and
[dark](evidence/w14-budget-viewport-dark-report.png) screenshots; no source,
financial assertion or test deadline was changed for this evidence capture.
