# F04-d review and decisions

Fresh whole-branch review of ea72f67..bd68312 found two Important findings, no Critical/Minor. Both grades retained after tracing the actual retry helper and route; one TDD correction pass, no re-review.

1. A 429/503 backoff could redispatch captured private context after session revocation. The offline HTTP regression observed a second provider call after logout. Every provider attempt now invokes a live authorization guard before dispatch; revocation returns401 without a second call.
2. A still-valid session could receive an answer derived from a shared plan made private, or a task reassigned while the provider awaited. Two HTTP regressions observed200 with the synthetic private reply; a retry regression observed redispatch of a newly invisible plan. The guard checks all captured task/plan/medication IDs against current rows and current actor visibility before dispatch and after the provider resolves. Deleted/invisible context returns409 without its content. Four actual RED cases became GREEN; the authorized overload-retry characterization still succeeds.

Rulings and costs:

- Discard an entire stale answer rather than remove portions whose provenance cannot be established. Cost: the user resubmits after visibility changes; information already sent while authorized cannot be recalled from a provider.
- Retain existing assistant retry behavior for unchanged authorization. Only assistant chat uses the object-context guard; other AI paths remain subject to the subsequent F04 input/privacy slice. Cost: this is not acceptance of all provider flows.
- Exact-HEAD Windows evidence is independently read by the author from full logs and both JUnit/JSON/native/production artifacts before merge; reviewer declined Windows execution. Cost: no merge if that evidence is incomplete.
- Browser/PWA remains F05; Server2019 remains R02. Media, field/schema/proxy/bootstrap, reward/notification derivatives, backup/log privacy and dependencies remain subsequent F04 work. Cost: no full F04, foundation or Internet-readiness acceptance from this PR. No release/tag or VPS operation is authorized.

No dependency or lockfile change. Existing Notes edit grants, own-patient choices, family birthday calendar projection and authorized mutation assertions remain. No deferred Minor.

Full corrected-suite validation initially failed `pushTransport.test.ts` (571/572): its100ms wall-clock deadline elapsed before two real response chunks on a busy worker. The fixture now observes two actual chunks, then advances only the deadline timer by100ms; all native socket-closure/uncertainty/chunk assertions remain. Removing the production deadline temporarily makes the targeted test fail at its10s test bound, then the original source is restored. The mutation run selected one test; its three unselected siblings are not acceptance evidence. Full-suite acceptance runs all tests with zero skips. No production transport change or deadline relaxation.
