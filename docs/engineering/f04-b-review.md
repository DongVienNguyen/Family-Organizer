# F04-b review and decisions

Whole-branch fresh reviewer examined91d5695..351cf8e (PR8). Three Important findings, no Critical, one Minor. Author retained the Important grades and completed one TDD fix pass; no second reviewer pass.

1. Async action ownership began only at fetch. Image optimization/FileReader and push permission/service-worker/subscription continuations could read replacement user B credentials after starting under A. Capture revision before first asynchronous operation and check before subsequent network/browser side effects. Actual helper and avatar/assets/document/push callback regressions observed15 combined failures across this finding plus the two below, then passed. Continuation audit in the same fix pass additionally reproduced debt batch second-file upload, restore confirmation and finance/emergency lazy PDF import under B; four further actual RED cases now GREEN. Current-session image/upload/push/restore/PDF behavior also remains covered. Callback fixtures execute extracted production functions transpiled by TypeScript with synthetic browser adapters; they are not browser E2E.
2. SSE and authorized ICS replaced no-store with no-cache. Actual factory/loopback HTTP regressions observed both successful private responses returning no-cache, then GREEN no-store. No authentication/ACL certification is inferred from these cache-header tests.
3. Queued storage events could retain obsolete A while persisted token was B; cleanup retry never converged. Actual main listener/two-boundary overlap regression and token-change-during-cleanup regression observed RED. Non-writing transitions now reconcile the authoritative stored token after purge; storage listener reads current token rather than queued event.newValue. Tests verify convergence without recursive writes.

A first continuation test used an incorrect callback end marker and an incomplete finance fixture. Those errors/false pass were corrected before witnessing the four actual RED cases; they are not evidence of a production fix.

Cloud accepted correction:435/435 tests51files, zero skipped/failed/todo, lint/build exit0. All earlier assertions retained; no dependency/lock change. Exact Windows correction/final HEAD evidence is recorded in implementation-status and the PR proof comment.

## Deferred minor

Guarded body.cancel/early async iterator break does not consistently cancel or release response ownership. Owner is bounded by120s and session changes still guard/abort stale access; no current frontend consumer uses the iterator. Record for authenticated streaming work in the following F04 slice. This PR does not claim native stream cancellation parity; it does not hide this finding behind passing request tests.

## Rulings on unjudged gates

- Windows evidence: reviewer declined independent execution; author reads exact-SHA full logs/two artifacts and verifies JUnit/JSON/native/production/exit/hash evidence before merge. Cost if wrong: Windows acceptance would lack proof; no merge until verified.
- Real PWA/logout/switch/IndexedDB/offline behavior requires F05 browser execution. VM/callback fixtures prove contracts only. Cost: browser acceptance remains incomplete until F05.
- Authenticated SSE/media/object/notification/input/proxy/bootstrap/privacy/dependency gates remain subsequent F04 work. Public media is still public despite no-store. Cost: no Internet-readiness/fullF04 claim until those gates pass.
- Server2019, packaging/service/encryption/power-loss/performance remain F06/F07/F09/R02. Cost: source Windows2022 proof cannot certify deployment.

Existing implementation rulings and costs remain in client-session-isolation.md. No release/tag or VPS access/deployment.
