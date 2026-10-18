# Wallet query reference — W17 subset

Source `0c61cc602038dd77189a7b167f06b27be2998a0e` preserves the physical query SQL, both current-authority
reads, exact Money validation, cursor/signature fences and all data/ACL checks.
Validation reuses the existing bounded named-timezone path; public formatters
remain fresh. Predicates capture reviewed filter inputs once; metadata caches
only descriptor names and always creates fresh values and nested audit JSON.

The portable `scripts/benchmark-wallet.ts` creates its own synthetic temporary
DATA_DIR/config, applies explicit pilot schema16, uses one I01 store, and closes/
removes only that fixture. It starts no runtime/jobs and calls no providers.
Reference data:100000 records, one private VND account, alternating income/
expense across2026, null historical metadata, no FX/labels/splits. Twenty measured
samples follow three warmups. Exact monthly counts/totals and50unique in-period
rows are checked independently. Hardware/runtime/source/samples/RSS/integrity/
network/cleanup are recorded; p95 uses nearest rank. This workload does not
qualify every filter,100k complete recovery or actual Server2019.

| Metric | Baseline Cloud p95 | Current Cloud p95 | Required reference Windows target |
| --- | ---: | ---: | ---: |
| Page50 | 711.9ms | 204.0ms | <500ms |
| Month report | 2209.0ms | 838.5ms | <1000ms |

Current Cloud host:Node24.21.0/x64/better-sqlite3 13.0.3, four available CPUs.
The full machine and20samples are in the proof. Both Cloud targets are measured
below the reference limits; **Windows performance remains unqualified**.
A Windows reference CLI run must use the pinned runtime, clean source,100k data,
20iterations and network boundary, and exits nonzero if qualification fails.
A1000-row diagnostic test never becomes a Windows acceptance result.

Targeted200tests/13files and matching JUnit, zero failures/skips/todo, lint/build0;
exact-HEAD benchmark and retained CPU profile/development failures. No full
aggregate or browser repeat for this subset; W16’s8391/493+65Chromium remains
separate historical evidence. No PR/CI URL, backup branch only.
[Proof](evidence/w17-query-performance-development.json).

Next:10k import responsiveness, complete recovery/system/Windows qualification,
W18 legacy bridge/capacity/retention/cutover and remaining P/M1/I02/I03/master.
No release/tag/VPS access or deployment. Actual Server2019 R02 remains separate.
