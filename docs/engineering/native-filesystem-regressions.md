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
