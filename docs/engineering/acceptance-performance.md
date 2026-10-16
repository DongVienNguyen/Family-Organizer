# Windows acceptance performance

CI-OPT-01 changes orchestration only. Node22/24 still each run npm ci, lint,
all unit/SQLite tests with measured coverage, build and native probes. The 45
legacy browser cases, 26 Productivity cases per engine and native touch case
remain mandatory, first attempt only. Existing deadlines, eight checks, eight
archives, eleven raw validation families and ci-gate remain unchanged.

## Measured bottleneck

Baseline [run38879051719](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38879051719)
tested112d398b09f2a9e26afa2edffe538eddc071ce5a. Jobs took22m45s from the
first job start through ci-gate (24m08s including initial queue time).
The production-browser job took14m26s; the WebKit/aggregate job then took8m11s.
Its job-level dependency delayed independent WebKit installation/build/tests.
Machine-readable original timestamps are in evidence/ci-overlap-baseline.json.

WebKit now starts immediately on its own Windows2022 runner. After it finishes,
a read-only barrier waits for the original Node22, Node24 and production-browser
jobs in the same repository/run/attempt/SHA. Failed/skipped/cancelled producers,
identity mismatch, incomplete job lists, API failure and bounded wait expiry
fail closed. Polling reads status only; it does not execute or retry tests.
Only this job receives actions:read. Its token is scoped to the barrier step;
request/response objects and credentials are never printed.

After all producers succeed, the existing exact-SHA/attempt artifact downloads,
original blob/JSON/JUnit provenance checks and aggregate evidence writer run
unchanged. reports/producer-barrier.json records the observed identities and wait.
The barrier has a12minute polling budget, ten-second API request bounds and the
existing25minute job deadline. No deadline or worker count increases.

Estimated saving: about8minutes (roughly35% of the measured job critical path).
This is a projection; runner availability and actual Windows results determine
the measured outcome. An unsuccessful run is retained as unsuccessful evidence.

## Avoid additional acceptance churn

- Put source, regression tests and known evidence into one reviewed commit before
  publishing. A source correction gets a new exact-HEAD run with its failure history.
- Record final tested SHA, run URL and raw verification results in the PR body or
  acceptance comment. Copy that proof into the next dependent documentation change.
  Do not push a link-only commit that cancels a running qualification just to add
  its own URL or SHA. This avoids self-referential metadata reruns.
- Read independent evidence while remaining jobs execute. Reuse only already
  downloaded immutable reports from that exact run/SHA/attempt; validate all
  required families and final producer success before accepting the PR.
- Preserve the separate post-merge main run and Windows Server2019 R02 boundary.
  Keep synthetic data, offline providers, cleanup and native exit checks.
