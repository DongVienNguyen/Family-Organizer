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

## Queued import development

**W17 import subset (2026-10-18):** source `7cae94af340ac4596f1fe8f12e754d33bd548cec` adds cooperative queued
preparation and set-based exact int64 ledger/provenance/audit writes inside one
I01 transaction, with current ACL/catalog/preview fences and safe queued-failure
state. Preview yields and rechecks current references before persistence.
Benchmark rejects a preloaded installation without touching or closing its DB.
Cloud full8409tests498files/matching JUnit/zero failed-skipped-todo,
all8391 W16 parents +18 retained; lint/build0. Whole Wallet Chromium65/65,
all65parent cases, offline/integrity/normal-stop/closed/cleaned/build-bound.
Original10k commit diagnostic8758.8ms; current focused1198.6ms; queued writer
~0.8s with heartbeats and only0/10000observable rows. These are Cloud diagnostics,
not Windows performance acceptance. [Proof](evidence/w17-import-development.json).
PR/CI URLs:none; author inspection only; backup branch. New system recovery
harness remains separate development. W17 full recovery/system, W18 global
capacity/retention/legacy bridge/networth/cutover, remaining P/M1/I02/I03/master
and final composed Windows batch remain. Server2019 R02 unrun; no release/tag/VPS.

## Complete-schema protected recovery

**W17 protected recovery subset (2026-10-18):** source `6c60ef308d249dc49de8d09ea4af118efa62247e` adds two
synthetic system checks and lint0, JSON/JUnit/native0. Actual live WAL encrypted
capture → independent installation restore → runtime restart preserves every
schema16 Wallet row, exact Money, receipts, ACL, settings, occurrences and trades;
a pre-existing target session is revoked. Rechecksummed/reencrypted corrupt trade
cash is rejected before target writes. Offline/owned roots/closed/cleaned.
Test-only additions: production sources unchanged from7cae94a; prior8409/498,
build and65Chromium remain separate evidence, no new aggregate claimed.
[Proof](evidence/w17-system-development.json). PR/CI URLs:none; author inspection,
backup branch only. Next W18 must address shared100000total-row backup capacity
before claiming100k complete recovery; per-table import guard is insufficient.
Legacy bridge/Asset/networth, remaining P/M1/I02/I03/master/final Windows remain.
Server2019 R02 unrun; no release/tag/VPS.
