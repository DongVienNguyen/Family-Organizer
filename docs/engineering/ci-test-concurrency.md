# Windows test concurrency

The accepted 35-case Productivity suite was close to the existing twelve-minute
WebKit process limit. The pending 39-case feature PR reached that limit after
37 cases. Increasing the suite size requires independent work to run in parallel.

Quality runs two Vitest **fork processes**. Each file still uses the existing
synthetic working directory, isolated storage, offline fetch boundary and mandatory
SQLite close/removal in `tests/setup.ts`. Worker threads are unsuitable because
legacy fixtures change the process working directory. Coverage, assertions and
individual test/hook deadlines stay unchanged.

Each Productivity project runs two default-mode files: C01–C15 and C16 onward.
Each worker receives its own production server, SQLite database, configuration,
foreign working directory and loopback port. Sharing one database would race
full-collection reward assertions and saved-view mutations. Each store retains all
13 scenarios for its engine, nine views and two boards. The default seed without
an isolated project still retains the original 39 Tasks.

The original 35 test calls, shared helper bodies and offline/zero-error hook calls
are preserved verbatim. Default mode continues remaining cases after a failure;
there is no serial-suite skip mode, retry or increased timeout. Matrix/Section
native touch retains its original file, one worker and trusted pointer assertions.

The parent drains both servers and inspects both databases before removing their
fixtures. Every part must prove unique store ID/port, unchanged legacy file hash,
integrity, closed handles, cleanup, zero native exits and no provider network.
Both workers must record the same actual pinned browser bytes. Original producer
JSON records must place the two case groups on different worker indices.

`productivityBrowserWorkers=2` is a literal trusted-source capability. Original
project reports require two workers; the official three-project Playwright merge
records six. Missing parts, one-worker reports or unbound worker claims cannot
qualify that target. Historical one-worker evidence remains valid only under its
original source profile. The raw reader and collector retain this distinction.

Cloud development checks pass 5,706 tests in 311 files with matching JUnit,
coverage, lint/build and all 35 Chromium cases plus native touch. These results do
not qualify Windows, Firefox or WebKit. The exact-HEAD Windows run must still pass
all eight checks, independent raw report families, package/service tests and log
inspection. The comparison against accepted PR133 records observed durations and
workload/runner differences; it is not an isolated hardware benchmark.

The first Windows checkpoint `03cadf6` / [run38968002316](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38968002316)
failed: both5,706/311 quality suites passed, WebKit passed34/35 beforeC31 reached
its45-second test limit at final Close, and the Node24 job was cancelled at its
20-minute job limit with incomplete Chromium reports. All8artifacts and130logs
(27,806lines) were retained and read. Partial Chromium traces show slow input and
context teardown; their cause is unproven. The successful quality steps took
386s(Node24) and503s(Node22), versus619s/741s at accepted133, despite59more tests.
The successful Firefox producer took264s versus358s. These are hosted-runner
observations, not a controlled benchmark; failed/cancelled browser timings do not
qualify a speed improvement. The whole run is not Windows acceptance.

A narrow post-review CI repair moves the unchanged MatrixC16–19 calls and helpers
to the advanced file. This removes the observed overlap of Matrix screenshots
withC31. The strict group boundary and synthetic reader fixture move together.
The parent also streams its existing bounded native output immediately, preserving
progress if a job is interrupted. Neither repair increases any deadline or changes
assertions/retries. The original single LOCAL SELF review stays closed; this is
recorded separately as actual CI-driven validation repair, without a rereview claim.

After this CI change is accepted, PR134 must compose it and independently qualify
all 39 cases on all three Windows engines. Windows Server2019/R02, releases and
VPS deployment remain separate and have not run.
