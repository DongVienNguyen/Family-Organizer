# Tiến độ Windows-native

## F01 — Baseline/Windows CI bootstrap

- Repo: `DongVienNguyen/Family-Organizer`, base `main`, branch `codex/f01-windows-baseline`.
- Source checkout SHA: `68cb753c13c35e13dd120b217040aa12365e3b40`;
  planning baseline `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`; diff chỉ7tài liệu.
- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/1 (merged theo phê duyệt riêng của user ngày11/10/2026).
- Last verified Windows HEAD: `d9935772551d71f4e3b893772990685219360799`.
- CI: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38134448734
  (PR, attempt1, success); both Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0
  on Windows2022/x64/image20261004.326.1: install/native/lint/tests127/build/evidence
  success, ci-gate success, zero failed/skipped. Logs và JUnit/JSON artifacts đã đọc.
  Immutable bootstrap summaries: `evidence/f01-bootstrap-node22.json`, `...node24.json`.
- Native addon11.10.0/SQLite3.49.2: Node22 prebuiltABI127; Node24 compiledABI137,
  node-gyp12.4.0, VS2022 17.14.37710.0. Runtime default được chọn/pin Node24,
  types24.19.2 và npm11.19.0; addon giữ exact11.10.0, bỏ duplicate Vite devDependency
  nhưng giữ production import. Lockfile cập nhật, không upgrade toàn bộ dependency.
- Verified runtime/gate commit: `b03765da4d1fb44028d002f87bc7f908acd68a12`.
  CI: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38135149119
  (PR, attempt1, success). Both Windows jobs install/native/lint/tests138/build/evidence
  success; ci-gate success;11test files, zero failed/skipped. VS pin và action versions
  mới đã chạy thật. Full logs/JUnit/JSON/native reports đã download/read. Summary và
  report SHA256: `evidence/f01-validated-toolchain.json`.
- Các SHA/run trong file này là snapshots đã kiểm chứng trước commit cập nhật tài liệu.
  Commit tài liệu cuối vẫn cần cùng CI trên HEAD mới; xem exact HEAD/run ở PR checks
  và comment evidence cuối của PR. Không gán báo cáo parent SHA cho documentation HEAD.
- Review: phát hiện gate chấp nhận native metadata sai hoặc suite rỗng.11 regression
  tests RED→GREEN; toàn suite138/138 Cloud Node24, lint/build/native và npm ci đạt.
  Gate giờ require mỗi baseline suite, consistent totals, native runtime/ABI/OS/addon/hash/checks.
- Source corrections: updater đúng repo; SQLite close idempotent, fixture cleanup không
  nuốt lock errors. Tests synthetic/temp cwd/offline fetch; Telegram delivery mocked.
- GitHub API/log/artifact proxy requirements đã thêm vào environment draft và xác minh
  đọc được. Không cấp thêm secrets. Cloud install/start instructions được lưu riêng;
  draft save không phải publication hoặc nghiệm thu task mới.
- Remaining: chunk >500kB warning (F09); DATA_DIR/scripts F02; lifecycle/Docker updater
  F03; auth/media F04; HTTP/browser/full regression F05/F09; I01 snapshot/gateway;
  Windows packaging/service/release F06–F08; WinSW/Caddy selection pending F07.
- Not-run: HTTP integration, E2E, full app/service/package/restore/performance suites,
  Server2019 acceptance R02. CI2022 không chứng minh R02. Không VPS access/deployment,
  release/tag hoặc merge; Matrix/Kanban/Wallet features chưa bắt đầu.
- Review finding đã sửa RED→GREEN, toàn suite138/138 đạt cả Cloud và Windows; không
  có Critical finding. Quyết định giữ addon11.10.0 có chi phí compiler trên builder;
  F06 phải dùng Windows binary trong ZIP. Không deferred code defect mới trong F01.
- F01 baseline/CI/runtime pin đã được chứng minh; toàn giai đoạn F01–F09/I01 chưa xong.
  Tool/service package checksum/compatibility phần WinSW/Caddy vẫn phải xác minh ở PR
  service/package, không hứa Server2019-ready. Không dùng binary tải không có kiểm chứng.
- Next sau review/merge PR này: F02 scripts/path configuration (DATA_DIR absolute,
  Unicode/spaces/CWD cases); rồi F03 lifecycle và I01 theo dependency. Không tự bắt đầu
  features hoặc deployment. Required-status ruleset `ci-gate` enforcement thuộc F05.

## F01 — Final artifacts recovered and authorized merge

- Exact final PR HEAD `198e50aee8dd7e8944ceb91bfc0d9cc384abcdcc`; run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38135532244.
- Final JUnit/JSON/native/evidence ZIPs now downloaded and independently read:138passed tests/11files per runtime, zero failed/skipped, exact SHA. Previous proxy download blocker resolved in this environment session. Hash summaries: `evidence/f01-final-head.json`.
- User authorized merge **only PR #1**; squash main commit `903e6401f33fa08ad8b95fc3e4865dff27fa45c0`.
- Main CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38137109865 reports success for that exact merge SHA. No subsequent PR merge, release/tag or VPS permission granted.

## F02 — Native scripts / config roots (implemented; awaiting PR review/merge)

- Branch `codex/f02-native-paths`; BASE/main `903e6401f33fa08ad8b95fc3e4865dff27fa45c0`. PR #2 and verified Windows results are recorded below. Intermediate results remain historical snapshots.
- Implemented source: stable code/data/config/log roots; production absolute external DATA_DIR; selected configRoot dotenv; actual write checks; rooted media/DB/settings/updater/static assets. Corrupt legacy JSON fails instead of silently seeding a new family.
- Native clean/changelog scripts; old Bash release removed and release command explicitly disabled. Explicit offline copy migration has dry-run/report/backup, SQLite staging, integrity/hashes, source preservation and refusal of overlapping/existing/linked targets. See `native-paths.md`.
- Initial implementation moved Vite and its two build plugins to devDependencies after lazy-loading development Vite. Production-only install previously retained tsx via Vite's optional peer. Subsequent native/version and i18next changes are recorded below; the final lockfile includes those changes.
- Cloud RED: root/scripts/migration contracts; corrupt legacy import; provider .env must not change launch roots/NODE_ENV; production evidence missing/wrong SHA/checks. GREEN whole suite161tests/14files, lint/build (before final CI/reviewer updates). Do not interpret Cloud as Windows.
- Windows CI adds production-only clean layout, System32 cwd, static/PWA/login/legacy IDs/restart, ACL-denied write startup, blocked external providers, explicit exit/log/evidence and finally process/ACL/file cleanup. Final execution results are below.
- Real SQLite finding: readonly opens create source WAL/SHM. Migration opens only a private copied database, keeps original source untouched. This offline copier does not replace the online snapshot engine required by I01.
- Remaining/unrun: portable ZIP F06; graceful lifecycle F03; HTTP/browser/full regression F05/F09; service/online restore F07/I01; R02 Server2019; release/VPS gates remain unauthorized. Existing chunk-size warning stays F09.
- Next after F02 review/merge: F03 lifecycle/telemetry/remove Docker updater. Later PRs require review; do not silently merge to advance the plan.

### F02 — PR/review and first actual Windows failures

- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/2 (open; do not merge without review/authorization).
- First Windows HEAD `92621a84cd7d2f6e0d622ab23511dba754ebdf98`; run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38138220750 failed. Logs read: Node24 unit worker native ObjectWrap abort (156passed of161;13of14files); both production smokes rejected retained TypeScript; ci-gate correctly failed. No pass claim for that SHA.
- Root cause isolated: i18next optional TypeScript peers remain under production install; browser i18next packages moved to devDependencies. SQLite11.10.0/Node24.21.0 failed allocation-driven statement GC (SIGABRT), matching nodejs/node#65446. Pin13.0.3 N-API to remove the ObjectWrap path; retain Node22/24 pins. Lockfile removes obsolete native prebuild-install dependencies and adds node-addon-api; no unrelated major upgrades.
- New deterministic native-GC regression RED on11.10.0 → GREEN13.0.3; actual loaded native binary is hashed rather than assuming old build/Release location. Cloud SQLite3.53.4. Windows startup/native/GC compatibility rerun pending.
- Fresh review: three Important path/migration findings (Windows root-relative paths, report alias via ancestor junction, invalid JSON-only migration) addressed with RED→GREEN tests. Restart smoke strengthening also requires a post-import mutation survive restart, not merely the same legacy JSON read twice. See `f02-review-and-decisions.md`.
- The failures above were intermediate results. Verified corrected results are below; next PRs await user review and separate merge approval. Full plan is not complete; no release or VPS access.

### F02 — Verified corrected Windows implementation

- Verified source HEAD: `f622ded54d3d71d02998f617edde7d0629d80420`.
- CI: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38139108034 (PR, attempt1, success); both Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0, `ci-gate` success.
- Each runtime: `npm ci`, native SQLite probe, `npm run lint`, `npm test`, `npm run build`, production-only System32 smoke all success with individually recorded exit code0. JUnit and Vitest JSON independently confirm175passed/16test files, zero failures/errors/skipped/todo. No assertions removed, retry masking, continue-on-error or lowered chunk threshold.
- Full logs and both artifacts downloaded/read. Immutable evidence/report hashes: `evidence/f02-validated-source.json`; exact documentation HEAD/run is additionally recorded in the PR evidence comment after its own CI, avoiding assigning parent-SHA reports to a newer commit.
- Native: exact better-sqlite3 13.0.3, N-API10, SQLite3.53.4; both runtimes load `prebuilds/win32-x64.node`, SHA256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`. Allocation-driven GC regression and existing SQLite/backup/migration tests pass. Historical F01 ObjectWrap evidence remains unchanged.
- Production fixture: no source TypeScript/dev dependencies; Unicode/spaces external roots, actual `C:\Windows\System32` cwd, static/PWA/login/legacy IDs; new task write persists after restart while legacy JSON stays unchanged. Real ACL denial yields expected EPERM/fail-fast, then ACL/process/file cleanup succeeds. External providers blocked, no attempted real delivery, only synthetic data.
- Fresh whole-branch review findings fixed in one RED→GREEN pass; full Cloud Node24 suite175/175, lint/build/native and production-only fixture also pass. Decisions and costs: `f02-review-and-decisions.md`.
- Remaining/unrun: F03 graceful jobs/HTTP/DB lifecycle and Docker-updater removal; I01 online snapshot/restore; F04 auth/media; F05/F09 full HTTP/browser/E2E/regression/performance; F06 actual portable ZIP; F07 service; R02 Server2019. Existing >500kB chunk warning remains for F09. No full-phase or Server2019 acceptance claim.
- Next: review and separately authorize merge of PR #2, then F03 from the merged main SHA. Only PR #1 has merge permission. All51 master tasks remain tracked by the approved plan; F02 implementation is verified, not merged. No release/tag/VPS access or deployment.

## F02 — Authorized merge / F03 baseline

- User explicitly authorized merge only PR #2 and continuation to F03.
- PR #2 final HEAD `fe6b3ece85142e650e2ac20d6806056930792940`; CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38139609734 success. Downloaded/read both exact-HEAD artifacts:175/175tests16files each, six exit checks0, production/System32/ACL/native13 success. Final hashes recorded in PR evidence comment https://github.com/DongVienNguyen/Family-Organizer/pull/2#issuecomment-6109078173.
- Authorized squash main SHA `d178b170838cea44a10f83014681c240239156e4`. Main CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38139931589 reports success for that merge SHA.
- F03 branch `codex/f03-native-lifecycle`, BASE `d178b170838cea44a10f83014681c240239156e4`. No later merge/release/VPS authority.

## F03 — Lifecycle / telemetry / Docker runtime removal (implemented; awaiting PR review/merge)

- Factory with injected legacy dependencies; explicit storage bootstrap/bind; readiness/liveness/maintenance gates. Bounded idempotent drain handles accepted bodies, async requests after disconnect, SSE, active maintenance, jobs and detached push callbacks before native close.
- Shared AppJobs process registry, namespaced/serial schedules and pause/resume without startup replay. I01 durable lease/retry/outbox remains pending. CLI stdin stop supports Windows graceful tests; POSIX signals retained. Actual WinSW wiring F07.
- Native os/process/statfs(DATA_DIR) metrics, unsupported temperatures/load clearly null/UI text. App apply/restart/Immich management routes/jobs/UI/mailbox writers removed; readonly version and configured external-service links retained. Documentation updated; release remains disabled.
- RED→GREEN: registry/metrics/factory/lifecycle/effects/readonly version/UI; maintenance ownership/partial body; required lifecycle CI evidence. Real source process stop/restart/crash preserves synthetic HTTP writes and legacy input; native files rename/clean up. Initial Cloud suite206/206 in23files and Windows run38141305196 at5f4c451 passed, but independent review subsequently found ownership defects. Do not use that result as acceptance of the corrected implementation.
- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/3. Fresh review found four Important ownership and two Minor behavior errors; one RED→GREEN fix pass protects initialization handles, process ownership, independent bounded disposal/storage closure and non-mutating unavailable readiness, plus birthdays and parser status. See `f03-review-and-decisions.md`.
- Corrected Cloud Node24 suite216/216 in24files, lint/build and compiled production-only graceful/restart/crash/offline/write-obstruction fixture pass. Local fixture is labeled working-tree-f03-review-fixed and is not Windows/exact-SHA evidence. Corrected Windows CI remains pending until the fix commit is pushed and verified. No dependencies changed in F03, so lockfile remains unchanged.
- Unrun: I01 online snapshot/restore, full HTTP/domain/browser/performance F05/F09, portable ZIP F06, service F07, Server2019 R02. Existing >500kB bundle warning remains F09, threshold unchanged.
- Next after F03 review/merge: I01 gateway/migration/snapshot using this same jobs/store lifecycle. Only PR #1/#2 merges approved so far; PR F03 must wait for review and separate merge approval. Full51-task plan remains incomplete; no release/tag or VPS access/deployment.

### F03 — Verified corrected Windows implementation

- Task F03, PR https://github.com/DongVienNguyen/Family-Organizer/pull/3, branch `codex/f03-native-lifecycle`, BASE/main `d178b170838cea44a10f83014681c240239156e4`.
- Corrected verified source HEAD `89f99c85dbdb73545758438ef1e85cf4f5bdc293`; CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38142346992, attempt1, success. Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 on Windows2022 x64; `ci-gate` success.
- Each runtime: npm ci/native SQLite/npm run lint/npm test/npm run build/compiled production smoke all success, six individually recorded exit codes0. Independent JUnit/JSON reads confirm216passed in24files, zero failed/errors/skipped/todo. Full logs and both artifact sets downloaded/read. Source snapshot and every report/log SHA256: `evidence/f03-validated-source.json`.
- Native13.0.3/N-API10/SQLite3.53.4 load/CRUD/transaction rollback/WAL backup/integrity/file cleanup and allocation-driven GC pass on both runtimes. Loaded Windows binary SHA256 remains `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.
- Real malformed-schema regression observes the native connection closed before rejection, then renames/deletes fixture files while the process remains alive on Windows. Duplicate/concurrent starts cannot dispose the running store; original owner still reads/writes/closes. Maintenance readiness never mutates its storage. Disposal reject/timeout still attempts safe native close after owner drain; undrained owners retain storage and report failed shutdown.
- Compiled production-only layout: System32 cwd, Unicode/spaces external roots, real ACL-denied fail-fast/EPERM, preserved legacy IDs/session/settings and post-import task writes. Four launches/three graceful stdin stops plus abrupt crash/recovery; actual native files/ACLs/processes cleaned up. Providers blocked and synthetic data only. This is not a portable ZIP or WinSW/Server2019 acceptance.
- Four Important/two Minor whole-branch review findings addressed with one RED→GREEN fix pass; no deferred review code defect. Rulings/costs: `f03-review-and-decisions.md`. Earlier206-test green run remains historical and is explicitly superseded by this correction.
- Evidence above belongs to the source SHA, preceding this documentation commit. The final documentation HEAD must also pass the same Windows CI; its exact SHA/run and report hashes are recorded in PR checks and the final evidence comment, avoiding self-referential commits or attributing parent reports to a newer SHA.
- Remaining/unrun: I01 online gateway/migration/snapshot/restore; F04 auth/media/privacy; F05/F09 full browser/domain/performance; F06 portable ZIP; F07 service/WinSW; R02 Server2019. Existing bundle-size warning remains F09, limit unchanged. F03 changes no dependency or lockfile.
- Next: review PR #3 and separately authorize its merge, then I01 from merged main. Only PR #1/#2 merges have authorization. Full51-task plan is not complete; release/tag and all VPS access/deployment remain unauthorized.

- Dependency audit limitation: Windows install logs report13 findings for the development install and6 for production. A separate Cloud `npm audit --omit=dev --json` returned exit1 with10 affected package entries (4 moderate/4 high/2 critical, including inherited Express severity from proxy-addr), no automatic fixes offered. Registry audit metadata differs by query time; preserve each actual result. Snapshot: `evidence/f03-production-audit.json`. F04 must triage affected paths/updates before Internet readiness; F03 CI is not security acceptance. Lockfile is unchanged by this audit.

### F03 integration and I01-a in progress

- F03 PR #3 final HEAD `9009a66e79c878c45a0929948429215815407a6b` passed exact Windows run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38142720657 (Node22/24, each216tests24files, all6exit checks +ci-gate). Squash merged as `06657385b15543840cee51c6da60f8fadba1daa5`.
- User now authorizes all reviewed, exact-CI-verified PR merges without another question. Prior historical permission gates above are superseded. Release/tag and VPS access/deployment remain forbidden.
- I01-a PR https://github.com/DongVienNguyen/Family-Organizer/pull/4; branch `codex/i01-storage-gateway`, BASE `06657385b15543840cee51c6da60f8fadba1daa5`. Twelve intentional RED tests at HEAD `27d9ee323cf2793c0fa3a4a19b42c4946c3fc4b8` failed on both Windows runtimes in https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38145312689; logs/artifacts downloaded/read. Install/native/lint/build/production passed; test/evidence/gate failed, as expected for RED.
- Shared same-handle synchronous write gateway, idempotent results/409 conflicts, authenticated actor context, changed-collection persistence/conflict refusal, transitive audit of74legacy writers, atomic canonical reward claim/reversal adapter and explicit pilot migration registry implemented. Request bodies are hashed; retry results are stored under the existing database ACL. New domains remain absent/version0.
- Cloud Node24 whole suite232/232tests27files passed; lint/build verification follows source commit. No dependency changed; lockfile unchanged. Additional schema/ownership and reward regressions observed RED→GREEN. This is development evidence, not Windows acceptance.
- I01-a review/Windows GREEN pending. I01 remains incomplete: snapshots/media/filesystem recovery, persistent jobs/leases/retry/outbox and worker-aware restore belong to the next focused I01-b PR, followed by F04/F05. F06 package, F07 service, F09 browser/performance and R02 Server2019 remain unrun. Baseline dependency audit findings remain F04. Full51-task plan is not complete.

### I01-a corrected implementation awaiting exact Windows verification

- First source `361eeab5aaf97d1246dc3589af4a603ad665615f`, Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38145880020: bothNode22/24passed232/232tests27files, all6exitchecks0+gate. Full logs/two artifacts independently checked; hashes in `evidence/i01-a-first-source.json`. This evidence predates review fixes.
- One fresh review found3Important+1Minor; typedHTTP409 was re-graded Important for the specified conflict contract. One fix pass added7failing regressions, then corrected async/thenable migration rollback, savepoint baseline publication only after the outer COMMIT, retry lookup before callback-internal task/note/document optimistic checks, and pure common HTTP4xx/error ports. Access checks remain before commands. No deferred review minors; decisions/costs in `i01-a-review-and-decisions.md`.
- Corrected Cloud Node24:239/239tests28files, zero failed/skipped/todo, lint/build success. No dependency/lockfile change. The fixed exact source SHA/Windows run follow in the next verification entry; do not attribute first-source reports to this corrected code.
- I01-a PR #4 remains draft pending corrected Windows checks. After verified review/merge, execute I01-b snapshots/leases/retry/outbox, then F04/F05 and remaining master milestones. Full I01 and all51tasks remain incomplete; no release/tag/VPS performed.

### I01-a — verified corrected Windows source

- Task I01-a, PR https://github.com/DongVienNguyen/Family-Organizer/pull/4, BASE `06657385b15543840cee51c6da60f8fadba1daa5`, corrected source HEAD `3a75f74be75f72f7196681b8b823f89bec9166db`. Windows2022 x64 run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38146607782, attempt1, success.
- Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each passed npmci, native SQLite, lint, npmtest, build and compiled production smoke: all6individual exitcodes0. Each JUnit/JSON report239passed28files, zero failed/errors/skipped/todo. `ci-gate` success. Full logs and both complete artifact sets downloaded/read and independently validated; report hashes in `evidence/i01-a-corrected-source.json`.
- This includes the seven review regressions and typedHTTP conflicts/authenticated retries, migration async/thenable rollback and outer rollback/retry baselines. Native13.0.3/N-API10 binary matches the previously verified Windows hash. Production-only layout, System32/Unicode roots, real ACL denied startup, preserved legacy/session/settings, post-import writes, graceful stops/restart/crash recover all pass.
- Four Important findings fixed in one RED→GREEN pass; no deferred minors. Earlier232-test GREEN remains historical; all corrected claims refer to3a75f74. Dependency audit and bundle warnings remain F04/F09, not hidden or lowered. No dependency/lockfile change.
- Source evidence precedes this documentation commit; final documentation HEAD also requires exact Windows CI. Its SHA/run/report hashes will be in PR checks and final evidence comment, avoiding self-referential commits. User authorizes verified/reviewed merge without another question.
- Next immediately after PR #4 merge: I01-b consistent snapshots/worker-aware restore, file staging/recovery and persistent jobs/leases/retry/outbox. These tests remain unrun; whole I01 remains incomplete. F04–F09/domain/integration/release preparation follow master order. Server2019 R02/service/package/browser/performance remain separate unrun gates. No release/tag/VPS performed or authorized.

### I01-a integrated; I01-b durable jobs starts

- I01-a PR #4 squash merged as `ab83299eb91760dcdebde571ed852d14fdb0b76e`. Final PR HEAD `55b045ba2a389946b74cbb8faae1c07bd666a6b2`, exact Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38146942115: Node22/24 each239tests28files, six command exit checks0, ci-gate success. Full artifacts/logs independently read/verified. Final evidence: https://github.com/DongVienNguyen/Family-Organizer/pull/4#issuecomment-6110042686.
- Corrected report task labels from F03 to I01-a; SHA/run/test/exit/native/production facts and report hashes are unchanged. A post-verification convenience-key lookup errored and the shell continued to the authorized merge after exact checks and independent reports had already passed. Sequential verification/mutation scripts now stop on any bookkeeping error.
- I01-b BASE `ab83299eb91760dcdebde571ed852d14fdb0b76e`, branch `codex/i01-durable-jobs`. Separates durable namespace/key/lease/retry/outbox ownership from the subsequent I01-c snapshots/file journal/recovery/HTTP coordinator so each PR has a focused review range. No domain feature flag enabled. Whole I01 remains incomplete until I01-c acceptance.
- Seven durable queue regressions added before implementation: atomic effect+points rollback, namespace dedupe/conflict, two lease owners/fencing, bounded retries/backoff, unknown external outcome, crash retry without duplicate reward, and restore policy preserving only future schedules. Targeted Cloud RED observed; exact Windows RED follows in draft PR.
- Next: implement storage port on the existing AppJobs registry and legacy notification delivery; then I01-c, F04/F05 and remaining master milestones. No release/tag/VPS.

### I01-b implementation, awaiting review and Windows GREEN

- Task I01-b, PR https://github.com/DongVienNguyen/Family-Organizer/pull/5, branch `codex/i01-durable-jobs`, BASE `ab83299eb91760dcdebde571ed852d14fdb0b76e`. Intentional RED source `e4ccca1b990edcc8163ea8dfd1712fc9530d3f4e`, Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38147654737: both239existingtests passed, seven newtests failed at stub ports; lint also exposed a test-helper inferred UUID type corrected before GREEN. Logs/bothartifacts downloaded/read.
- Persistent jobs/outbox share the existing gateway/connection/registry; canonical key dedupe, renewable fenced leases, attempts/backoff, stable command IDs and explicit unknown external outcomes. Ownership checks fence business SQL before commit. Legacy push references enqueue with their notification and delivery revalidates recipients; provider failures propagate, bounded calls and detached-alert cleanup remain owned. Restore policy drops historical work but is not yet wired to I01-c snapshots.
- New fixtures observed RED→GREEN:8queue/fence,3durable registry,2push outbox,3bounded push provider,2scheduled provider failure tests. Cloud Node24 whole suite257/257tests33files, lint/build pass; exact Windows GREEN pending source commit. No dependency/lockfile change. No real providers, notifications or AI calls in tests.
- One local shell-wrapper run printed7passed but exited1; direct targeted rerun exited0 and later full suite passed257. Preserve this ambiguity and final explicit exit-code/Windows proof, not an inferred success from printed tests.
- I01-b review/Windows verification pending. Next after verified authorized merge: I01-c snapshot/recovery/coordinator, then F04/F05 and remaining milestones. Full51-task plan remains incomplete. No release/tag/VPS.

### I01-b — First Windows GREEN and reviewed correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/5, base/main `ab83299eb91760dcdebde571ed852d14fdb0b76e`.
- First source `f9bbdc00eba6f49247309a14014047d98638f3f2`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38149368740: both Windows2022 x64 Node22/24 jobs and ci-gate success. Independently downloaded/read logs, JUnit/JSON/native/production artifacts:257/257 tests33files each, no failed/skipped, npmci/native/lint/test/build/production exit0. Snapshot/hashes `evidence/i01-b-first-source.json`.
- One review found four Important defects; one RED→GREEN pass addresses daily/weekly unknown delivery replay, cleanup certainty, cached-bootstrap compatibility and push transport total deadline/cancellation. See `i01-b-review-and-decisions.md`. Corrected Cloud265/26534files, lint/build separately; source/final exact-HEAD Windows verification pending push. No dependency change; lockfile unchanged.
- Remaining: I01-c WAL/domain/media/version snapshot, HTTP/job drain and filesystem journal/recovery. Whole I01 remains incomplete. F04 auth/privacy/audit; F05/F09 browser/coverage/performance; F06/F07 packaging/service; R02 Server2019 are not run by this PR. No release/tag/VPS.
- Next: exact corrected Windows checks, read artifacts, merge authorized PR #5 after acceptance; continue I01-c from merged main.

### I01-b — Corrected Windows acceptance

- Corrected source HEAD `79c46aec9e51126ebce03ee7031c1e003a06f362`; PR https://github.com/DongVienNguyen/Family-Organizer/pull/5; CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38150238422 success.
- Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0: each265/265 tests34files, zero failed/skipped/todo, npmci/native/lint/test/build/production exit0; ci-gate success. Both full logs/artifacts downloaded and independently read; JUnit/JSON/native/production/report hashes in `evidence/i01-b-corrected-source.json`.
- All four Important findings fixed in one RED→GREEN pass. Owned request deadline/cancellation is tested through actual synthetic loopback sockets; no real provider/AI calls. No dependency/lock change. Existing bundle warning and dependency audit remain their F04/F09 gates.
- This documentation commit needs its own exact-HEAD run; final evidence comment on PR #5 will record that SHA/run before authorized merge. I01-c snapshot/recovery/restore remains next; no whole-I01, service, portable ZIP or Server2019 completion claim. No release/tag/VPS.

### I01-b integration / I01-c RED baseline

- PR #5 final HEAD `f8bf7d625292b920a24b4640b221e189d19939f7`; exact Windows CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38150500165 independently proved265/26534files per Node22/24, all6exit checks0+ci-gate. Evidence comment https://github.com/DongVienNguyen/Family-Organizer/pull/5#issuecomment-6110505226. Authorized squash merge `fb583fe82348ba5299c60d03a18c1d7b72412c1a`.
- I01-c branch `codex/i01-shared-snapshot`, baseline/main `fb583fe82348ba5299c60d03a18c1d7b72412c1a`; baseline delta is the reviewed I01-b queue/outbox/provider implementation. No unrelated branch change.
- Start synthetic acceptance tests for consistent WAL legacy/Wallet/points/media/version snapshot, invalid-input refusal, historical-effect restore policy, accepted-worker drain and filesystem rollback. Ports are explicit RED stubs; they are not a completed implementation. Windows RED run follows before source implementation. Whole I01 remains incomplete; release/tag/VPS forbidden.

### I01-c — Snapshot/coordinator implementation for review

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/6, branch `codex/i01-shared-snapshot`, base/main `fb583fe82348ba5299c60d03a18c1d7b72412c1a`.
- Windows RED HEAD `4d8017043cf69e64ad4673a9dd83a1c24923c6d6`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38150822113: both runtimes265existing tests pass/nine new snapshot tests fail at explicit stub. Full logs/artifacts independently read; no intentional skip or continue-on-error.
- Same-handle WAL snapshot with legacy/domain/points/versions and immutable media; trusted table registry/checksums/path validation; named provider/session secrets excluded from settings. ZIP/JSON restores await the shared maintenance/gateway, keep their accepted owner through disconnect, use a native safety copy and self-checksummed journal/SQL marker; startup recovers before readiness. Historical effects/leases drop, explicit future schedules retained. Six process-crash boundary tests; encrypted recovery and power-loss/service acceptance remain F07/R02.
- Snapshot read results cache only a marker, reject a mutating callback and require fresh read IDs; business/restore idempotency preserved. Original writer assertions retained with explicit awaited async-coordinator/no-local-writer audit. Public service links preserved; old ZIP/JSON accepted only pre-domain/claim cutover. See `shared-snapshots.md` for rulings/limits/costs.
- Cloud Node24 tests300/300 in38files, zero failed/skipped; lint/build checked separately. No dependency/lock change. Exact source Windows CI and fresh whole-branch review pending push; full I01 is not yet accepted. All providers synthetic/offline; no real notifications/AI, release/tag/VPS.
- Next: review complete branch, fix graded findings with regressions, verify exact Windows logs/artifacts and merge under existing authorization; then F04/F05 and remaining master milestones. Full51-task plan remains incomplete.

### I01-c review fix pass

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/6; BASE `fb583fe82348ba5299c60d03a18c1d7b72412c1a`. First source `af8961f93ef4f000bfacb8f252b6bf8cfb366fc3` and exact Windows run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38153439050 independently verified: Node22/24 each300/300 tests38files, install/native/lint/test/build/production exit0, ci-gate success. Reports/hashes: `evidence/i01-c-first-source.json`.
- Fresh whole-branch review found six Important issues, no Critical/Minor: imported backup traversal/deletion; incompatible journal bound; retained absent public settings; unstable legacy ZIP identity; file-backed retry relying on restored metadata; suppressed HTTP409. One fix pass adds11 regression cases, observed RED then GREEN, whole Cloud311/31138files; lint/build exit0 recorded separately. Corrected source and final documentation HEAD must pass Windows before merge.
- Decisions and detailed regression evidence: `i01-c-review.md`. No assertion/skip/threshold change, no dependency/lock change, no real provider calls. Journal regression first failed its size precondition; expanded fixture then independently observed the actual reader rejection before implementation. Backup metadata reconciliation preserves local ordinary JSON references while rejecting imported paths.
- I01 remains pending corrected/final exact Windows acceptance and PR integration; F04 starts immediately afterward, followed by F05–F09 and master domain milestones. Server2019 R02, browser/performance, service/encrypted recovery, package and future-domain cold restore remain unrun gates. No tag/release/VPS access or deployment.
