# F04-c review and decisions

Fresh whole-branch review of f774488..4345016 found three Important defects, no Critical/Minor. Author retained all grades and completed one TDD correction pass; no re-review.

1. `response.end()` could leave a slow native socket queued after removal from the registry, bypassing connection limits and escaping endStreams. A real HTTP/paused TCP fixture observed RED destroyed=false after backpressure. Closing now retains the admission slot until the close event, ends and destroys the response, and avoids duplicate closure. The native fixture then observes transport destroyed and listener/slot cleanup; existing heartbeat/capacity/assertions remain.
2. Locked body.cancel/released reader read or cancel/locked pipeTo could reject while releasing a live owner. Four native Web Stream operation regressions and two real loopback HTTP SSE transport regressions observed RED captured signal unaborted after session change. Precondition failures retain ownership; genuine read errors, successful cancellation/default iterator and successful pipes still release it. Native transport cases then observe abort and response destruction. The existing preventCancel/current-session assertions remain.
3. Completion/approval can generate a private successor for a different child through recurring rotation. Two actual native SQLite/FamilyDB plus HTTP/SSE regressions observed the successor created but no TASKS_UPDATE for its assignee. Routes now collect newly created task IDs with the returned original, and recipient filtering unions visibility over the affected IDs. Payload remains generic; no IDs are serialized. Both direct completion and adult approval then notify the successor's child.

Nine new actual RED cases across these findings became GREEN. Full-suite and exact corrected/final Windows evidence is recorded in implementation-status/PR proof. No dependency or lockfile change. Earlier Windows source run remains historical and does not prove the corrections.

## Rulings on deferred acceptance

- Reviewer declined exact-HEAD Windows execution/artifact verification. Author independently reads full logs and both artifacts, JUnit/JSON/native/production reports, exits and hashes before merge. Cost if wrong: source acceptance lacks evidence; no merge until verified.
- Browser/PWA acceptance remains F05; source/native/VM tests do not establish it. Cost: cannot claim real browser cache/user-switch acceptance yet.
- HTTP/media/object/input/notification/bootstrap/proxy/privacy/dependency gates remain subsequent F04 slices. Cost: fullF04 and Internet readiness remain incomplete.
- Windows2022 cannot certify Server2019 R02, package/service/encryption/power-loss/performance or deployment. Cost: no foundation/deployment acceptance before those gates; no release/tag or VPS access/deployment is authorized.

Policy rulings/costs: own-patient invalidation preserves child refresh without notifying other limited viewers; authoritative HTTP policy follows. Caller `preventCancel` conservatively retains remaining body ownership until consumption/cancellation/session/deadline, rather than pretending transport completed. Transient prior recipients receive only an invalidation needed to remove a formerly visible item; subsequent private writes exclude them. Costs: no authoritative HTTP or browser acceptance inferred, and explicitly unconsumed streams remain bounded by the existing deadline.
