# Windows test concurrency

The accepted35-case Productivity suite approached its12-minute WebKit process
limit; PR134 reached that limit after37of39cases. Quality now uses two isolated
Vitest fork processes. Each test file retains its synthetic DATA_DIR/cwd, offline
boundary and mandatory SQLite close/removal. Worker threads cannot safely replace
forks because legacy fixtures change the process working directory.

Browser concurrency is explicitly **Chromium1 / Firefox2 / WebKit2**. Two separate
Windows checkpoints made two-worker Chromium fail from C01 and eventually exceed
the job limit. Its native-driver cause remains unproven. Chromium retains the
accepted single-worker approach: one production fixture and one entry point that
registers C01–C15 followed by C16 onward. Each Firefox/WebKit worker owns its full
engine-specific13Task production fixture, database/config/cwd and loopback port.
Both stores retain all nine views/two boards; the unselected default fixture still
retains the original39Tasks. Core and advanced modules register the same test call
texts and helpers. One hook owner per entry installs the offline/zero-error guards.
No serial-describe mode introduces failure skips.

The strict target contract contains a literal per-engine worker map. Original
producer JSON must report1/2/2 workers; the official three-project merge reports5.
Every declared store must prove its own unique ID/port, unchanged legacy file,
integrity, closed handles, cleanup and offline/native0. Actual pinned browser bytes
must match all store runtime reports. Chromium's two case groups must both use its
single worker; Firefox/WebKit groups must use distinct workers. The raw reader and
collector preserve the exact map. Historical absent/one-worker and uniform2worker
source profiles remain distinct; neither can qualify this target by omitting proof.
The source parser reads literal AST data without executing target code and rejects
computed, missing, duplicate, extra or unsupported map entries.

The original35test calls, six shared/Matrix helper bodies, offline/zero-error hook
calls and entire Matrix/Section native-touch source remain unchanged. Registration
regressions require every Chromium case once in original order and complete,
disjoint Firefox/WebKit files at C15. Native touch keeps one worker and its trusted
pointer, checkbox/cancel/no-mutation assertions. Coverage, assertions, test/hook/
process/job deadlines and zero retries remain unchanged.

Actual Windows failures are retained, never promoted to acceptance:

- `03cadf6` / [38968002316](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38968002316): both5706/311quality suites passed; WebKit34/35 stopped at C31's45-second budget; Chromium job cancelled with incomplete reports. All8artifacts/130logs27,806lines retained/read. Moving unchangedC16–19 into the advanced file removed the observed Matrix screenshot/C31 overlap. Bounded native output now streams live instead of remaining buffered until exit.
- `ac1957b` / [38971855661](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38971855661): both5706/311/JUnit suites and all35Firefox/all35WebKit cases passed. Fourteen Chromium failures were logged before job cancellation; final Chromium/touch proof is absent, so aggregate/ci-gate failed. All8artifacts/131logs27,794lines retained/read. This motivated engine-specific concurrency rather than new selectors or larger deadlines.

The original one LOCAL whole-branch SELF review remains closed. Actual subsequent
CI-driven scheduling, streaming and per-engine fixture repairs are inventoried
separately, without a rereview or independent-review claim. The first mixed-policy
regressions produced151pass/4FAIL before code, then155GREEN. Wider477checks caught
one old uniform mock and the legacy assembler's explicit default; these were
corrected while preserving legacy profiles. The subsequent TypeScript optional
parameter diagnostic is retained and fixed with an explicit undefined default.
A wrong-build local development run is also retained and excluded from acceptance.

Final Cloud qualification passed5727tests/312files with matchingJUnit and
V8coverage on two forks, correctedlint/build0 and all35Chromium plus nativeTouch1
with matching35+1JUnit/native0. The actual rebuilt application matched the original
reviewed CI build. Firefox/WebKit each listed all35cases; they were not run in
Cloud. A separate browser-free protocol probe used the pinned Playwright1.64.0
to merge actual1/2/2worker blobs and independently confirmed merged5/3control
cases/JUnit; those control cases are not application acceptance. Fresh exact-HEAD
Windows qualification is still required for the mixed target. Observed
successful step timings are recorded separately from failed/cancelled timings;
different hosted machines/workloads do not establish a controlled benchmark.
After acceptance, PR134 must compose this change and independently qualify all39
cases per engine. Server2019/R02, release/tag and VPS access/deployment have not run.
