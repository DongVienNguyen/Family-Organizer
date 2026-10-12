# F07-l — exact filesystem identities and atomic approval reads

Main CI38312242120 at a571d62 failed two Node24 retention cases and native
update-ready. The prior PR37 exactHEAD CI passed; both results are retained.
The native service report still confirmed service removal and fixture cleanup.

Two independent defect classes are reproduced before correction:

- Distinct 64-bit directory inode values can round to the same JavaScript Number.
  Retention incorrectly treats disjoint directories as one. The regression gave
  one failure/39 prior passes; BigInt directory identities fix the comparison.
- An operator atomically replaces the fixed held control leaf with approval while
  its old descriptor is being read. The original reader rejects that ordinary
  publication. The regression gave one failure/25 passes. At most three complete
  reads are now allowed for a replaced leaf, with unchanged exact parent identities.
  Every read validates ordinary files, counts bytes, closes descriptors and clears
  buffers. Manifest reads, changed parents, in-place mutations, malformed controls,
  foreign operation/manifest bindings and exhausted retries still fail closed.

Startup still requires approval, health, storage/schema smoke and the durable
writes-open record before jobs/readiness. No timeout, approval rule, rollback latch,
service ACL or security assertion is removed. Tests retain changed-parent rejection,
foreign-approval refusal and prove three replacement reads close all three handles.

The old native service log exposed only Startup validation failed, so its exact
error code remains unconfirmed. The CLI now emits only a fixed allowlisted update
error code; arbitrary errors remain generic. A real child CLI foreign approval
regression checks the safe binding code, exit1 and graceful close. This diagnostic
contract is not counted as an additional old product defect.

Cloud GC trials retain their failures. Old-space64 alone still yielded a measured
256MiB total heap and timed out after the loop marker. The test now also limits
semi-space8 and asserts actual total heap<=128MiB, no explicit global.gc, all300000
SQL assertions, zero native exit/signal/error and the original15-second timeout.
Production Node flags and runtime/dependencies/lockfile remain unchanged. Missing
pressure-receipt RED was a new contract availability assertion, not a product bug.

Targeted218/5, full1924/104 with zero failed/pending/todo, and lint/build0
are verified on pinned Cloud Node24.21, sequentially with one worker. One fresh
whole-branch review and exact-HEAD Windows/native evidence are pending.
Native Number-identity diagnostics contain only synthetic numeric IDs, no paths
or secrets. Windows2022 success will not certify Server2019/reboot/off-host/RPO/RTO.
F09 financial source is preserved separately pending this baseline correction.
No release/tag/VPS operation is authorized or performed.

One fresh review0Critical1Important0Minor found ancestor baselines reset between
read retries. The inter-attempt parent replacement regression reproduced acceptance
and is now refused with one shared baseline, no durable mark and the first
descriptor closed. Target219/5 is green; a corrected full run is still required.

Initial ECC Windows CI38314999862 has1922/1924 on both runtimes: bound leaf
publication and three-replacement count fail, despite Cloud positives. Native
rename/descriptor failure details were hidden by the safe control error. The next
checkpoint collects actual Node-rename and .NET-replace/removed-backup observations
without declaring them acceptance. Every native child exit/signal/error and
fixture/descriptor cleanup is checked; required unit/browser/package/service
assertions remain. Corrected exact Windows proof still required before merge.

Checkpoint2eaccb7 / CI38316300066 failed both runtimes1923/1925, diagnostic
publisher timeout, service explicit binary rollback and ci-gate; producer/consumer/
browsers passed. Actual unit fixture errno is EPERM/rename because Windows refuses
Node overwrite of an open destination. No Number-rounded native inode collision was
observed in the42 retention diagnostics; the synthetic precision regression proves
the defect class, not the original native failure cause.

The corrected race fixture routes a logical namespace to fresh immutable real
files/directories. Native reads/fstat/BigInt identities and all existing assertions
remain real; only namespace replacement is modeled. It verifies bound approval,
foreign refusal, all three exhausted reads/closed descriptors and inter-read parent
replacement. Actual .NET publication remains a separate mandatory service check.
The diagnostic publisher now announces its attempt asynchronously; the reader
closes before waiting for its exit, preventing the observed synchronous deadlock.
The original10-second child budget and checked exit/signal/output bounds remain.
This diagnostic still does not certify atomic-publication acceptance.

Native service checkpoint2eaccb7 reports UPDATE_CONTROL_INVALID on the worker and
UPDATE_HEALTH_FAILED before the deliberate metadata fault executes. An allowlisted
read-stage diagnostic now distinguishes filesystem boundaries without logging
paths, bytes, IDs or arbitrary errors. The added stage test is diagnostic coverage,
not an additional historical product defect. Target220/5 passed on Cloud; new full
source verification and exact new-HEAD Windows are pending. No native pass claimed.

Corrected frozen Cloud run:1926/1926 tests104files, zero failed/pending/todo;
220 targeted5files, lint/build exits0. The full native-GC stress passed11.235s
within the original15-second limit. New exact Windows still required; service
filesystem read-stage diagnosis remains pending, no native whole-run claim.
