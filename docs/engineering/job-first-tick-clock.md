# F05 follow-up — scheduled job first-tick eligibility

A scheduled registry captured `now`, then enqueued a job whose default `available_at` reads the clock later, and finally tried to claim using the earlier `now`. Crossing only one millisecond made the newly scheduled job ineligible on its first tick. A later polling tick could run it, which concealed the defect in frozen-clock tests.

The registry now reads the clock for claim after enqueue. It does not add an explicit `availableAt` to the scheduled payload, since that would change the stable idempotency hash across restarts in the same occurrence. Interval/occurrence keys, retry/backoff, lease ownership, effect unknown-outcome handling and future job eligibility stay unchanged.

An actual SQLite/fake-clock regression advances the clock1ms inside the real enqueue call and observes the real first claim. Original code fails4/3/1: claim1767225600000 precedes available1767225600001. Corrected jobs/lease/recovery schedule tests pass38/38 across5files, including managed startup. The existing startup100ms assertion, all outer deadlines and every readiness/storage/key/cleanup assertion remain. No test retries or skips were added.

The investigation started when a P08 composed Cloud full run produced4329tests/4328passed/1missing-key health failure (`never` instead of `failed`). That report/JUnit is retained. The original failure has no complete timing trace, so this document proves the deterministic first-tick defect without claiming it is the sole possible cause of every startup timing failure. P08 sorting remains in a separate saved branch and needs composition/full verification after this baseline fix is accepted.

One whole-branch self-review0critical/0important/0minor, no correction or rereview. Full Cloud/lint/build and new exact-HEAD Windows remain pending. No schema, dependency, key material, production provider, release/tag/VPS or Server2019 acceptance change.
