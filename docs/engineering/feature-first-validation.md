# Feature-first development and final Windows qualification

User direction, 2026-10-17 (Asia/Saigon): prioritize completion and functional
testing of the main features; perform comprehensive Windows testing at the end
of the feature group. This changes the development sequence in the earlier Cloud
guide. It does not remove assertions or authorize release, tags or VPS access.

## Delivery order

1. Finish the usable M1 flows already in progress: shared Tasks/Matrix/Kanban,
   column settings, grouping/order/WIP, workflow and child Review, adult approval,
   recurrence and rotation. Preserve Task deadlines, proof and exactly-once points.
2. Complete Wallet core in dependency order from the approved master plan:
   storage/authority, accounts, transactions, transfers, queries and reports,
   dashboard, import/export and rules. Retain existing finance behavior during
   migration; completing contracts alone does not complete Wallet.
3. Continue the later approved family planning, integration and depth milestones.
   Optional polish does not take precedence over a broken or missing main flow.

## Development loop

- Work in the existing Cloud checkout. Use separate logical commits and reviewable
  feature groups, without publishing each intermediate commit to Actions.
- For each changed behavior, run its relevant domain/API/SQLite regression tests
  and actual browser journey in Cloud. Include denial, cancel, conflict/replay and
  relevant reward or money invariants. Use only isolated synthetic data and offline
  provider adapters.
- Run lint and build when source changes require them. Before closing a feature
  group, run the full aggregate unit/integration suite and relevant browser flows.
  Preserve native exit codes, test counts, failures and JSON/JUnit evidence.
- Reuse a prior result only when its tested inputs are unchanged; record the input
  identity and scope. A Cloud pass does not establish Windows compatibility.
- Continue independent feature work while existing CI runs. Investigate an actual
  failure using its logs instead of rerunning unchanged tests or collecting the
  same evidence repeatedly.
- Stage the full Cloud suite and a full browser batch separately when they share
  a small CPU allocation. In the W11 four-CPU Cloud run, the unchanged12000-node
  snapshot test took11994ms alongside Chromium and crossed its fixed10000ms
  budget. After the browser finished, that same test took5568ms with unchanged
  source/assertions/budget. Retain the failed full report and finish a fresh full
  suite; a selected passing case is insufficient. GitHub jobs on separate Windows
  VMs can still run concurrently. Avoid adding retries or extending timeouts to
  compensate for contention in a shared Cloud host.

## Final Windows gate

- Publish a feature group when it is functionally ready, then run the required
  Windows2022/pwsh checks at its final HEAD: installation, lint, unit/integration,
  build, browsers and the applicable package/service checks.
- Read reports and logs once for that HEAD. A real failure requires a diagnosed
  correction and new verification; do not weaken assertions, skip, retry tests,
  use continue-on-error or raise deadlines to obtain green checks.
- Keep required PR/ci-gate/up-to-date/no-bypass protection. Do not disable workflows
  or bypass checks to postpone Windows. Unqualified dependent work stays on the
  development branch until its merge gate is satisfied.
- Prepare a Windows x64 test package and instructions only after its exact source
  and artifact are qualified. Do not ship Cloud node_modules. User PC testing is
  voluntary product feedback, not a required CI runner.
- Windows2022 evidence does not qualify Server2019 (R02). No release/tag, VPS
  access or deployment is authorized by this sequencing change.

## Status language

Track feature implementation, Cloud functional verification and final Windows
qualification separately. Do not mark a full P/W task or the master plan complete
from a passing slice. Give the user a short list of usable flows, remaining main
flows and blockers rather than a repeated CI chronology.
