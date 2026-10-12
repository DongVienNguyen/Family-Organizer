# F05-b: coverage baseline and ratchet

Measurement is in progress; no coverage acceptance or frozen Windows threshold
is claimed yet. The quality job runs the full Vitest suite with the matching
dev-only coverage-v8 4.1.11 provider. Coverage includes every production TS/TSX
file in src/server; tests and type-only declarations are excluded, and no ignore
pragmas are present. JSON detail/summary, LCOV and HTML are retained under
reports/coverage with the existing always-uploaded quality evidence.

The first Cloud diagnostic passed1146tests/78files, npmci/audit0/lint/build and
accounted for all104source files. Its totals are31.48%lines,33.73%statements,
31.64%functions and28.52%branches. These figures measure in-process Vitest
execution; actual browser and compiled/native-process behavior has separate
functional evidence. Low coverage in unmounted legacy React components remains
visible. No files/assertions are removed to improve the percentages.

The Node22/24 Windows measurements must be read independently before freezing
the ratchet. The final gate will reject missing reports, inconsistent raw
counters/LCOV/source inventories and percentages below the measured baseline.
New domain branches require acceptance-invariant tests; coverage percentages
alone do not prove all behavior. This draft measurement stage will not be merged
as completed F05-b before that gate and exact-HEAD Windows proof exist.

Npm caches now use explicit Windows architecture/Node/npm/lockfile keys via
the official SHA-pinned actions/cache v5. Only npm tarballs are cached, with no
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
