# Wallet internal API and session SDK — W04 partial

Source `73c6743a78654b9236e5205cdce3cea8e1af87f7` mounts gated Wallet routes through
the existing app auth and installation connection/I01 writer. The factory imports
no storage owner and applies no startup migration, activation, job or provider.
Wallet stays off by default; a quarantined/pending-receipt pilot blocks the API.
No activation endpoint, integration token or public integration surface is added.

Current adult role/deletion and account grants precede account/record/query/balance
access. Private/missing resources have the same404 shape; Child/Guest cannot use
financial routes. Writes require a caller-owned x-request-id and use the current
session actor; forged creatorId is ignored at the HTTP boundary. Revision, audit,
idempotency and exact balances remain in I01. Archive keeps history and prevents
new postings. Grant listing is manager-only; set/remove are explicit distinct
intents, active-adult targets only, with compact self-revocation receipts.

Partial record reads redact note/source/payee/payment-method/labels and do not
query hidden FX data. A hidden fee association is not returned. Invalidation
uses FINANCE_UPDATE with no financial payload and explicit previous/current
readable audiences, including linked fees. Media/export/chart/audit readers are
not completed by these endpoints and remain gates before cutover.

Targeted tracing starts before readiness/auth/parser so errors carry a requestId,
including JSON400, maintenance503 and sanitized native500. No raw request body,
credential or SQL detail is logged/echoed by this adapter.

The browser SDK uses the existing fresh auth-header callback, same-origin paths,
no-store and redirect:error. It owns no token storage, automatic retries or offline
write queue. Caller mutation keys survive unknown outcomes; reads retain ordinary
cancellation, and old-session responses are rejected. DTO decoding validates
identity, exact signed64/credit math, nullable metadata and current matching legs.
A list row does not claim unloaded FX/fee detail is absent. Browser bundling proves
no server/native SQLite/Node runtime import crosses into the SDK.

Full Cloud6824tests/362files/matchingJUnit/0failed-skipped-todo; all6770parent
retained+54. New cases:14grant commands,16actual authenticated HTTP and24SDK;
backend Wallet461/22files. HTTP role grid exercises15routes ×3identities. Lint/
build0. LOCAL SELF11paths0C/4I/4M, closed findings and RED evidence in
[proof](evidence/w04-internal-api-sdk-development.json); no independent/rereview
claim. A temporary Cloud transport failure recovered with the same clean988fc5c
checkout and pinned tools; no environment reinstall/config change was needed.

PR/CI run URL:none. Current interactive browser, Windows2022/Node22/package/service
and actual Server2019R02 remain unrun. Existing Finance is preserved; new Wallet UI,
private receipts, remediation/legacy bridge/raw backup conversion and parity are
unfinished. Full W04/Wallet/M1/master remains incomplete. No dependency/lockfile/
workflow, release/tag/VPS access or deployment change.
