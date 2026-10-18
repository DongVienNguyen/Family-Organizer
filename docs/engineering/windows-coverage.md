# F05-b: coverage baseline and ratchet

Windows measurement at HEAD `5b83bcadd9254c9534c4ed52c80b03c355432632`
passed in [run38191398754](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38191398754).
Both Node22.23.3 and Node24.21.0 passed1146/1146 tests in78files, all seven
native checks, audit0 and22 compiled proofs. All15 browser cases passed on their
first attempt. Three artifacts, full logs, raw coverage counters, complete source
inventory and LCOV were independently read; this was measurement, not gate acceptance.

The matching dev-only coverage-v8 4.1.11 provider includes all104 production
TS/TSX files under src/server, including unexecuted files. Only tests and type
 declarations are excluded. The native gate rejects symlinks and coverage ignore
pragmas; missing reports, source files, inconsistent counters/percentages or LCOV
fail CI. JSON detail/summary, LCOV and HTML remain in always-uploaded reports/coverage.

| Metric | Windows covered/total | Required floor on both pinned runtimes |
|---|---|---|
| Lines |3465/11005|31.48%|
| Statements |4737/14043|33.73%|
| Functions |983/3106|31.64%|
| Branches |3073/10768|28.53%|

The measured policy and raw report hashes are in
[evidence/windows-coverage-baseline.json](evidence/windows-coverage-baseline.json).
Each native coverage check validates the actual source bytes, provider, lockfile,
policy, requested HEAD/runtime and four raw reports. Its immediate native exit
is checked separately from the wrapper exit. The aggregate quality writer requires
this eighth check and both coverage regression suites. Floors cannot be lowered
to make a failure green; runtime/provider changes require reviewed Windows measurement.

The Cloud diagnostic branches figure is28.52%, one covered branch fewer than
Windows. Cloud is development evidence only. In-process Vitest coverage does not
include compiled-process/browser execution; those have separate functional proof.
Unmounted legacy React components retain visible low coverage. Percentages alone
do not prove all behavior; new domain branches need acceptance-invariant tests.
The single fresh review accepted two Important and one Minor findings; all were
fixed in one TDD pass with seven actual RED regressions. LCOV now binds function
declaration/name/hits and branch line/map-key/index/hits, rather than aggregate
hit multisets. All provider-supported exclusion aliases are rejected. Final
corrected HEAD27e0691/run38193519702 independently verified1222/80 per runtime,
all8checks0,15 first-attempt browsers and all104 raw coverage sources; mergedPR20
as main01b9a21. Proof: https://github.com/DongVienNguyen/Family-Organizer/pull/20#issuecomment-6116381748.

Npm caches now use explicit Windows architecture/Node/npm/lockfile keys via
the official SHA-pinned actions/cache v5. Implicit setup-node package-manager caching is explicitly disabled on both jobs.
Only npm tarballs are cached, with no
cross-Node restore prefix or node_modules transfer. PowerShell checks the native
cache-path npm command exit immediately.

F05-a PR19 was reviewed, passed exact HEAD1697bf939a57e7a463a95ea8141c30a4368822b7
in run38190289782, independently verified all3artifacts, and merged as mainb0f9a01.
Each quality runtime passed1146/78 and all7checks/audit0/22compiled proofs; all15
browser cases passed on their first attempt. Final proof:
https://github.com/DongVienNguyen/Family-Organizer/pull/19#issuecomment-6115959527.

Actual Administration-write API403 still blocks main enforcement. F04 backup/log
privacy and F06–F09 remain pending; Windows2022 is not R02 Server2019 acceptance.
No new P/W domain features, release/tag or VPS access/deployment.
