# Wallet account core — W04/W05 partial

Source `372433eee99ce6d62b463deb05c09299f8e9e34c` adds current adult/role/grant
checks, account queries scoped before row decoding, and visible-leg record reads.
Partial transfers expose no hidden account ID/name/currency/amount or free-text
source identifiers. Editing another creator's record requires manage everywhere;
own-record writes require contribute/manage on every leg. Revoked role/grant and
soft-deleted users are rechecked rather than cached.

Shared accounts default to contribute for adults to preserve shared family finance;
explicit read overrides that default. Owner/admin manage, Child/Guest never access
finance even as owner/grantee. Deleting a shared grant restores the family default;
private mode restricts membership. This resolves an unspecified shared default in
the spec and must remain visible in eventual grant UI.

Account commands create UUIDs, trust only current actor/clock, atomically audit
create/update/archive and use I01 revision/idempotency. Fresh authority precedes
cache lookup and repeats in the writer. Metadata changes and currency changes after
any posting are guarded; audit obstruction rolls back values/revision/receipt.
Missing/off wallet_active rejects commands. No route/UI/activation, grant editor,
legacy cutover or media serving was added.

Book balances use exact bigint opening plus nonvoid canonical postings through
the selected date. Opening enters on openingDate; postings are never silently
removed by category/opening-date filters. Cleared balances exclude uncleared.
Credit debt=max(0,-book), availability=limit+book; utilization is debt/limit as an
exact rational, null with zero/unknown limit. Derived overflow returns422 rather
than rounded/wrapped money. Credit position uses the current configured limit;
it does not reconstruct historical limit changes.

Cloud6493 tests/347files/matching6493JUnit/zero failed-skipped-todo, lint/build0.
All6425 previous cases retained+68 (29access/39account). Wallet154cases/8files run
inside the full suite. Raw RED failures, fixture corrections, frozen bytes and
report hashes are in [proof](evidence/w04-w05-account-development.json). One LOCAL
SELF5paths0C/0I/0M is an author review, not independent. No assertions/skips/retries/
timeouts were relaxed.

No PR/CI run exists for the development branch. Current Windows2022 Node24/Node22,
package/service and Server2019R02 remain unrun. No new browser test was needed for
unwired backend modules. Full W04 HTTP/media protection and W05 records/transfers/
UI are unfinished; W02 full entities/receipts, W03 migration and remaining M1/
Wallet/master acceptance are still required. No release/tag/VPS.
