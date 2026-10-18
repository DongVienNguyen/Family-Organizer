# Wallet recurring records — W12

Schedules describe income, expenses or transfers, including an optional transfer
fee. They track the household ledger; automatic mode cannot pay a bill, transfer
real money or contact a financial provider. Manual confirmation is the default.
Wallet remains disabled until explicit installation preparation and activation.

## Calendar and records

Weekly, monthly and yearly recurrence uses the existing P10 calendar planner.
Every ordinal is calculated from the original anchor and IANA timezone. Clamp
uses the last valid day; skip omits an invalid date. A January 31 monthly clamp
therefore produces February 28 in 2027 and March 31, without drifting to March 28.
An inclusive end date and interval are validated. A preview returns at most three
dates and writes neither pending occurrences nor money.

Materialization creates at most 100 pending occurrences per call, through the
current reminder window. A durable cursor and visible limited flag support
bounded catch-up. New definitions and edits start generation at the later of
today or the anchor, avoiding retroactive automatic recording after an edit.
The schedule/date pair and canonical record occurrence link are unique.

Confirmation either creates the record and fee, or links an existing exact
cashflow. The linked record retains its import/manual provenance; no second
cashflow is created. The server checks the occurrence and existing record
revisions, complete signed postings, currencies, date, fee and current write
permissions in the same I01 transaction. An import undo cannot remove an
occurrence-linked entry. Pending/skipped dates do not count as money.

Editing a definition updates matching future pending slots or explicitly marks
obsolete ones skipped. Past slots and confirmed records retain their frozen
definition. Pause/archive stops automatic processing without deleting history.
Ordinary record editing/voiding remains blocked for linked occurrences; a future
coupled operation must update both ledger and occurrence state atomically.

## Storage and shared jobs

Explicit Wallet schema 12 (standalone snapshot 13) adds schedule metadata,
occurrence metadata and reminder claims. Schema 1–11 SQL remains unchanged.
Existing opaque schedule rows without ownership metadata require remediation;
the migration does not guess owners. Snapshot validation binds owners, catalog
references, original recurrence ordinals, frozen money, state and canonical
record links. A historical reminder claim retains the revision and reminder
policy under which it was claimed, even after a later policy edit.

The existing durable AppJobs registry owns scan, confirmation and reminder jobs.
The same I01 writer commits claims, nonce receipts, ledger changes and shared
notification/outbox state. There is no second database, cron, delivery queue or
provider. Shared leases, abort/drain and retry/backoff remain in force. Job
payloads contain identifiers and revisions, with the current subject resolved
from owned rows; payloads do not confer actor or payment authority.

Jobs are bound to the common restore epoch. Old jobs cannot record restored
history; automatic occurrences on/before the restore's local day remain pending
for explicit review. This fence depends on the shared restore marker. Full
offline/native restore, protected receipt restore and cutover qualification are
still W17/I03/R gates, not established by these component tests.

## Private views and reminders

Definitions and occurrences are personal to their owner, including when another
user is an Admin. The owner must still have current access to every account in
the current definition and frozen occurrence, including any transfer fee leg.
Workers recheck current role and object permissions at commit.

Reminder claims are unique by occurrence, offset and recipient. Delivery uses
the occurrence's local day and rechecks pending status, pause/archive, policy
and current account scope. Paid, stale or revoked notices cannot be pushed.
Authorized historical notices may remain readable after payment. The existing
inbox/count/mark-read and push dispatcher use the same Wallet source policy;
missing or failed policy denies access, without generic finance-role fallback.
Tests use synthetic data and offline delivery adapters only.

Planning offers exact-money forms, preview, manual/explicit automatic mode,
reminders, pending/overdue/recorded/skipped history, pause and archive. The
same-day existing-record chooser reads at most 50 rows per page and captures the
selected record's revision before an explicit link confirmation. Private views
are retired on refresh/navigation/logout and restored only after fresh scope
checks. An uncertain command retains its original body and key in session memory
until explicit retry; navigation and live updates cannot resubmit it.

Current bounds are 1,000 schedules per owner, 100,000 total occurrences/claims,
and 1,000 occurrence history rows per list. A larger history produces an explicit
limit error. Date/cursor pagination and retention require W18 qualification.

## Evidence boundary

Source `0e33086d5434afa39d943dd07a2d2e29089df03e` is bound to all 44 frozen source/test/script inputs. Full Cloud
suite: **8024 tests/453 files**, matching full JUnit with
zero failed/skipped/todo. All 7927 parent identities plus
97 cases are retained with multiplicity. Lint/build exit 0. Final
Chromium **48/48**, all 45 parent cases retained, no retries/skips/flaky cases;
fixture 12 is offline, integrity OK, original Finance retained, normal stop,
closed/cleaned and bound to the tested build. Phone light/dark flows are included.

The first browser run retained 45 passes/3 failures; the second retained
47 passes/1 test locator failure. The real live-update selection race has a
regression and source fix; malformed fixture/helper issues were corrected without
weakening assertions or time budgets. The final full suite and browser run are
staged on the four-CPU Cloud host. Author inspection is not independent review.

[Proof](evidence/w12-schedules-development.json),
[full JUnit](evidence/w12-schedules-cloud.junit.xml.gz),
[full log](evidence/w12-schedules-cloud.log.gz),
[final browser JUnit](evidence/w12-schedules-browser-final.junit.xml.gz).
PR URL/CI run URL: none; backup development branch only. Windows 2022/Node 22/
package/service/other engines/touch and actual Server 2019 R02 remain unrun.
Next: W13 debts/goals, then the remaining approved scope above. No release/tag/VPS.
