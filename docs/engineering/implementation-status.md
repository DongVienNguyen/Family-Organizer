# Tiến độ Windows-native

## Current integration state — 2026-10-11

| Task | Current result | Evidence |
|---|---|---|
| F01–F03 | Reviewed, exact Windows GREEN, merged | PR1–3; historical entries below |
| I01 | Gateway, durable jobs and shared recovery integrated | PR4–6 |
| F04-a | Sessions/key rotation/loopback merged | PR7 HEAD8af9efe; Windows38157656295,352/352 per runtime |
| F04-b | Reviewed, exact Windows GREEN, merged PR8 | HEADe24825d; run38161521729,436/43651files per runtime |
| F04-c | Reviewed, exact Windows GREEN, merged PR9 | HEAD8cce8ee/run38165065503;512/51256files per runtime |
| F04-d | Reviewed, exact Windows GREEN, merged PR10 | HEADa86857a/run38167640833;572/57257files per runtime |
| F04-e | Reviewed, exact Windows GREEN, merged PR11 | HEADc2b0f88/run38171963503;664/66463files per runtime |
| F04-f | Reviewed, exact Windows GREEN, merged PR12 | HEAD8aa5299/run38174580999;762/76266files per runtime |
| F04-g | Reviewed, exact Windows GREEN, merged PR13 | HEAD7a46a62/run38177081124;860/86069files per runtime |
| F04-h | Reviewed, exact Windows GREEN, merged PR14 | HEAD63ef3ad/run38179151696;918/91871files per runtime |
| F04-i | Reviewed, exact Windows GREEN, merged PR15 | HEADe22b542/run38180187720;938/93872files per runtime; main26953ea |
| F04-j | Reviewed, exact Windows GREEN, merged PR16 | HEADcc45fe8/run38182693480;978/97873files per runtime; maine41e97d |
| F04-k | Scoped library patches implemented; full validation pending | BASEe41e97d;20actualRED/9chars; audit9→0 |
| F04 remaining | Provider/backup/log privacy, dependency and final proxy/browser gates pending | F04 checklist remains incomplete |
| F05–F09 | Browser/coverage/package/service/encryption/release-prep/performance pending | F05 protection writes403; Windows2022 does not prove Server2019 |
| P/W/I02–I03 | Pending foundation acceptance | No new domain features enabled |
| R01–R03 | Preparation pending; actual release/tag and VPS actions unauthorized | No VPS access or deployment |

Entries below are historical snapshots; later entries supersede earlier remaining-work lists and runtime choices. All51 master tasks are not yet complete. The user authorizes reviewed exact-HEAD Windows-GREEN PR merges without another question.

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

### I01-c corrected source verified on Windows

- Corrected source HEAD `7473483486e7499ed169ca3208a4d3fdbabf0adc`, PR https://github.com/DongVienNguyen/Family-Organizer/pull/6, exact Windows2022 x64 run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38154465590: Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each311/31138files, zero failed/skipped/todo, all six command exits0, ci-gate success. Full logs and both artifact sets downloaded/read; JUnit/JSON/native/production and hashes independently validated in `evidence/i01-c-corrected-source.json`.
- All six reviewed Important findings fixed in one pass; no minors deferred or re-review. Production-only layout/System32/Unicode paths, ordinary native addon hash, real ACL denied startup, legacy preservation/restart/graceful/crash checks pass. No dependency/lock change.
- This documentation commit still requires exact-HEAD Windows acceptance before merge; final SHA/run proof will be linked in PR evidence rather than self-referential commits. Full I01 integration remains pending that check/merge. Next F04-a internal expiring/revocable sessions and loopback binding; F04-b/c complete media/object/cache/privacy/input/dependency gates before F04 acceptance, then F05–F09 and master milestones. No release/tag or VPS access/deployment.

### I01 integrated; F04-a sessions starts

- I01-c PR https://github.com/DongVienNguyen/Family-Organizer/pull/6 squash merged as `ba69b09cd32d391487c67e345c76ce3bd08971d1`. Final HEAD `898a18504de14c72789938d8701696edb16108f5`, exact Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38154731628: Node22/24 each311/31138files, install/native/lint/test/build/production exit0, ci-gate success; all logs/artifacts and JUnit/JSON/native/production independently verified. Final evidence https://github.com/DongVienNguyen/Family-Organizer/pull/6#issuecomment-6111074950. Transient GitHub503 recovered; guards prevented merge until final artifacts were read.
- I01 implementation slices a/b/c now integrated. Domain features remain off; future domain cold-restore, service/power-loss/encryption and privacy acceptance belong their declared later tasks.
- F04-a BASE `ba69b09cd32d391487c67e345c76ce3bd08971d1`, branch `codex/f04-revocable-sessions`: internal Bearer expiry/native revocation/logout/password/role invalidation/key rotation and loopback binding. Twenty-two initial synthetic tests RED at explicit unimplemented auth/store ports; Windows RED to be observed before implementation. F04-b/c follow for media/object/cache/privacy/input/dependency acceptance; F04 is incomplete until all slices pass.
- No integration/scoped tokens, domain features, release/tag or VPS access/deployment. Cloud startup instructions saved with current lifecycle/merge constraints; saving does not publish an environment.

### F04-a implementation for review

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/7, BASE `ba69b09cd32d391487c67e345c76ce3bd08971d1`. Initial exact Windows RED `17932af41f5ef2f3ce941f4a8edf4cb824b683c9`/https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38155413684 independently read:311 existing passes22 new port failures, no skips, install/native/lint/build/production exit0 on both runtimes; gate correctly failed.
- Pure injected internal authentication, native hashed opaque sessions/12-hour expiry/persisted revocation/user versions/key generations. Logout; password/reset/delete/role invalidation in the same gateway; committed restore revokes local sessions. Old tokens require one login again. Configured key corruption fails closed; runtime/default listener bind127.0.0.1. Client clears login immediately and attempts bounded logout; password change clears login.
- Twenty-six auth/store tests GREEN, eight actual HTTP tests GREEN (seven observed security RED, forwarded-header throttling characterized), three client cases and two missing-production-proof gates RED→GREEN. Loopback RED→GREEN. Existing factory/gateway/retry/drain/restore assertions retained with issued-token fixtures and re-login after restore. No dependency/lock update.
- Final source Cloud351/35142files, lint/build exit0 after the default-listener regression. Exact source/final Windows remain pending. Compiled production probe now requires token restart/isolated logout evidence. Source review must be fresh and whole-branch; no merge until final exact-SHA logs/artifacts are verified. Details/limits in `native-sessions.md`.
- F04-a is an auth slice; F04 remains incomplete until media/object/cache/SSE/privacy/input/dependency and browser gates. No release/tag or VPS access/deployment; Server2019 R02 is separate.

### F04-a first Windows verification and review correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/7; first source HEAD `54df708c4c6765cb31dda4901bbde2343d84c2e5`, exact Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38156912516 independently verified: Node22/24 each351/351 tests42files, zero failed/skipped/todo, install/native/lint/test/build/compiled-production exit0; ci-gate success. Full logs and both artifacts/JUnit/JSON/native/production/hashes read; `evidence/f04-a-first-source.json`.
- Fresh whole-branch review found one Important idle-startup signing-key rotation defect, no Critical/Minor. One fix pass: three-process regression observed old token HTTP200 instead of401; explicit auth initialization now persists generation before readiness, GREEN401 after reverting the prior key. Pure factory construction remains free of storage/key I/O. Details/rulings: `f04-a-review.md`.
- Corrected Cloud Node24 full suite352/35242files, zero skipped, lint/build exit0. No dependency/lock change. Corrected source/final documentation HEAD still require exact Windows verification before authorized merge; first-source evidence is historical.
- Next F04-b/c media/object/cache/SSE/privacy/input/dependency gates plus F05 browser proof. Full F04/foundation/master plan remain incomplete; Server2019 R02/service/package/encryption/performance remain unrun. No release/tag or VPS access/deployment.

### F04-a corrected Windows source acceptance

- Corrected HEAD `67831edaa6f2980f05307cb485492931ae5c1fb1`; PR https://github.com/DongVienNguyen/Family-Organizer/pull/7; exact Windows2022 x64 CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38157389074 success.
- Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0: each352/352 tests42files, zero failed/skipped/todo, npmci/native/lint/test/build/compiled-production exit0; ci-gate success. Both full logs/artifacts independently read, JUnit/JSON/native/production/hashes validated in `evidence/f04-a-corrected-source.json`. The three-process idle key-rotation regression is included.
- One Important review finding fixed in one RED→GREEN pass; no minors or dependency/lock changes. This documentation HEAD still needs exact Windows CI; final SHA/run/report proof will be in the PR evidence comment before authorized merge.
- Next F04-b browser session/cache boundary, followed by remaining F04 media/SSE/object/input/privacy/dependency and F05 browser gates. Full F04/foundation/master plan remain incomplete; Server2019/service/encryption/package/performance are unrun. No release/tag or VPS access/deployment.

### F04-a integrated; F04-b client/cache implementation for review

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/7 merged as `91d569509e537729e6d6cd373d7e4a43eeedef0c`. Final HEAD `8af9efe9b3424abf007c31eea5c33854fc3cf027`, exact Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38157656295 independently verified352/35242files per Node22/24, all six command exits0 plus ci-gate. Full logs/both artifacts/JUnit/JSON/native/production/hashes read. Final proof https://github.com/DongVienNguyen/Family-Organizer/pull/7#issuecomment-6111469048.
- F04-b BASE `91d569509e537729e6d6cd373d7e4a43eeedef0c`, branch `codex/f04-client-session-isolation`. Internal request/session revision boundary, owned cancellation/deadlines/body+clone+stream guards and old401 isolation; React root remount purges private in-memory state. New session opens only after private cache/IndexedDB cleanup and safe controlling-worker acknowledgement. Cross-tab/restore/expired-session handling and late bootstrap/export guards. Theme/language/public shell/assets preserved; private URL-only offline fallback removed under approved privacy/no-store requirements. See `client-session-isolation.md` for limits/rulings/costs.
- Actual worker-source tests11RED/one public characterization→12GREEN; boundary16port RED plus clone-owner/browser-signal actual regressions→18GREEN; storage/worker13GREEN (one initially weak timeout assertion strengthened), listeners4RED→GREEN, HTTP no-store RED→GREEN, logout compatibility RED→GREEN, actual App bootstrap and late PDF export RED→GREEN. Existing finance/emergency PDF delivery characterized; providers synthetic/offline. New compiled production check requires private API/denial/media no-store proof; missing evidence gate observed RED→GREEN. All previous assertions retained.
- Final Cloud Node24 full suite406/406 tests49files, zero failed/skipped/todo, lint/build exit0. No dependencies/lock change. Exact source/final Windows CI and fresh whole-branch review remain pending; no merge claim.
- Remaining F04 authenticated SSE/media/object/privacy/input/proxy/bootstrap/dependency and notification gates; real browser logout/switch/offline/IndexedDB acceptance F05 remains unrun. F06–F09 and full master feature milestones follow foundation acceptance. Server2019 R02 separate; no release/tag or VPS access/deployment.

### F04-b first Windows proof and review correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/8; firstsource HEAD `351cf8ea60fa947abb43c2c34fefb825e233c496`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38159784805. Downloaded/read full logs and both artifacts: each Node22/24 has406/406 tests49files, zero failed/skipped/todo, install/native/lint/test/build/production exit0, ci-gate success. JUnit/JSON/native/production hashes and14 mandatory production checks independently validated; `evidence/f04-b-first-source.json`.
- Fresh wholebranch review found three Important issues: async A callbacks adopting B credentials, successful SSE/ICS overriding no-store, and obsolete cross-tab events leaving endless cleanup retry. One TDD fix pass with actual RED→GREEN regressions, including continuation audit for batch uploads/restore confirmation/lazy PDF import. Deferred Minor: native stream cancellation/iterator owner parity; documented in `f04-b-review.md` for following streaming slice. No second review and no assertions weakened.
- Corrected Cloud Node24 full suite435/435 tests51files, lint/build exit0, zero failed/skipped/todo. Two additional suites are mandatory in evidence validation. No dependency/lock change. Corrected source/final exact Windows CI remains required before authorized merge; firstsource proof is historical.
- Next: authenticated SSE/media/object and remaining F04 privacy/input/proxy/bootstrap/dependencies plus F05 actual browser proof. Full F04/F01–F09/master acceptance remains incomplete. Server2019/package/service/encryption/powerloss/performance unrun; no release/tag or VPS access/deployment.

### F04-b actual Windows failure and fixture correction

- Corrected application HEAD `35c41a770db25af493884f9e747fe0b463aaaacc`, Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38160905793 **failed**. Full logs/two artifacts read: both Node22/24 install/native/lint/build/production exit0, test exit1;434passed/1failed in51files, zero skipped/todo. `ci-gate` correctly failed. Failure is the cross-tab VM fixture slicing LF-only source and executing main JSX on CRLF checkout. Exact failed reports/hashes retained in `evidence/f04-b-crlf-failure.json`; build success is not test acceptance.
- Added explicit LF/CRLF cross-tab source cases: CRLF reproduced the same SyntaxError on Cloud, then GREEN after selecting the semantic createRoot boundary. Assertions preserved; no application change, no skip/retry masking. Final Cloud436/43651files, lint exit0; application build previously exit0 and Windows will rebuild exact HEAD. Updated source/final Windows acceptance still pending, PR8 not merged.

### F04-b corrected Windows source acceptance

- Corrected source HEAD `36ff534457c433ee3843cdb2512bf834d950722d`, PR https://github.com/DongVienNguyen/Family-Organizer/pull/8, exact Windows2022 x64 CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38161262854 success.
- Independently downloaded/read full logs and both artifacts. Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each436/436 tests51files, zero failed/skipped/todo, install/native/lint/test/build/production exits0; ci-gate success. JUnit/JSON/native/production hashes and14 mandatory production checks verified in `evidence/f04-b-corrected-source.json`. Explicit LF/CRLF cross-tab cases pass on Windows; previous failed run remains historical evidence.
- Three Important findings fixed in one TDD pass; deferred Minor stream cancellation/iterator owner parity recorded for next authenticated realtime slice. No dependency/lock changes, real providers, skipped assertions or retry masking. This documentation HEAD still requires its own Windows execution; final SHA/run/report proof will be recorded in the PR evidence comment before authorized merge.
- Next: F04-c authenticated realtime and owned streaming, followed by media/object/input/proxy/bootstrap/privacy/dependency gates and F05 actual browser proof. Full F04/foundation/master acceptance remains incomplete. Server2019/service/encryption/package/powerloss/performance remain unrun; no release/tag or VPS access/deployment.


### F04-b integration / F04-c in progress

- PR8 https://github.com/DongVienNguyen/Family-Organizer/pull/8 merged after fresh review and exact final HEAD Windows evidence. Final HEAD `e24825dab337e536724ab2f6f6097b09c4a879af`, run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38161521729: each Node22/24 install/native/lint/tests436/build/production14checks/evidence success, ci-gate success;51files, zero failures/skips. Full logs/JUnit/JSON/native/production artifacts independently read. Proof: https://github.com/DongVienNguyen/Family-Organizer/pull/8#issuecomment-6111965091. Squash main `f774488ea863019112a96a57f932c7676a558bb1`.
- F04-c branch `codex/f04-authenticated-realtime`, BASE that squash SHA. Source/testing in progress, PR/run pending; see `authenticated-realtime.md`. Does not declare full F04 or browser acceptance. No dependencies/lock change.

### F04-c — authenticated realtime source and review correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/9. First source HEAD `4345016c813ed49ff8587c926bbb4da3718bb7b8`; Windows run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38164217359 successful. Each Node22/24: npm ci/native/lint/tests503/build/compiled production15checks/evidence success, all six recorded exit codes0, ci-gate success. JUnit/JSON/native/production/full logs independently read,56files, zero failed/skipped/todo. Immutable source/hash summary: `evidence/f04-c-first-source.json`.
- Fresh whole-branch review retained three Important/no Critical/Minor. One TDD pass: native stalled socket ownership1; rejected stream preconditions4 plus native loopback transports2; actual native SQLite recurring completion/approval successor recipients2. Nine actual RED cases then GREEN. Corrected Cloud512/51256files, lint/build exit0. See `f04-c-review.md`; no dependencies/lock change. Corrected source/final HEAD Windows remains pending until reports are read; first-source reports do not certify fixes.
- Remaining: authoritative HTTP/object/search/AI/export filtering, media owner/reference/authenticated UI access, input/proxy/bootstrap/notification/backup/log privacy and dependency triage. F05 real browser acceptance unrun. Bundle >500kB warning retained for F09; no threshold change. F06–F09/P/W/I02/I03/R01–R03 incomplete; Windows2022 does not certify Server2019. No release/tag or VPS action.
- Next after exact corrected/final Windows acceptance and authorized PR9 merge: F04-d authoritative legacy object reads/actions from actual merged main. All reviewed exact-HEAD Windows-GREEN PR merges authorized; no additional merge question required.


### F04-c — corrected Windows implementation verified

- Corrected source HEAD `c7d7ddce4115d7013aa69489c67a32b39989d929`; CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38164770740, attempt1, success. Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0: npm ci/native SQLite/lint/tests/build/compiled production all success, six exit reports0; evidence and ci-gate success. Each512passed56files, zero failures/errors/skips/todo; nine review regressions included. Full logs and both JUnit/JSON/native/production artifact sets downloaded and independently read; immutable source/report hashes in `evidence/f04-c-corrected-source.json`.
- Native13.0.3/N-API10/SQLite3.53.4 verified with unchanged Windows binary SHA256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`. Compiled production-only launch from System32/Unicode external roots validates15checks including header-authenticated SSE, anonymous/URL-token denial, no-store initialization and bounded stream cleanup. Four launches/three graceful stops/crash recovery/write-denied/offline evidence preserved. Not portable ZIP/service/Server2019 acceptance.
- First-source503-test result is superseded by this512-test correction. Dependency audit remains13development/6production entries in the install logs; no automatic update performed in this focused PR. Input/proxy/bootstrap/privacy/dependency gates remain required before Internet readiness.
- This evidence belongs to sourcec7d7ddc, preceding this documentation commit. The final documentation HEAD must pass the same Windows CI; exact SHA/run/report hashes are recorded in PR checks and its final proof comment, without attributing parent reports to a newer SHA. PR9 is not merged until that proof is independently read. No deferred review Minor; rulings/costs recorded in f04-c-review.md.
- Next: authorized PR9 merge then F04-d authoritative legacy reads/actions from merged main. Remaining F04/F05–F09/productivity/wallet/integration/release-prep tasks continue; actual release/tag/VPS actions remain unauthorized. Browser F05 and Server2019 R02 unrun.


### F04-c integration / F04-d source in progress

- PR9 merged after fresh review and exact final HEAD `8cce8ee033fe6e23350483c9cf8b9e456c9c8ca5` Windows run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38165065503. Both Node22/24: install/native/lint/tests512/build/production15checks/evidence success, ci-gate success;56files, zero failed/skipped. Full logs/JUnit/JSON/native/production artifacts independently read. Proof https://github.com/DongVienNguyen/Family-Organizer/pull/9#issuecomment-6112440498. Squash main `ea72f67a59ac17335753ad2bb29d999bbc8e4326`.
- F04-d branch `codex/f04-authoritative-reads`, BASE that squash; source/tests in progress, PR/Windows pending. Shared server helpers govern HTTP/search/AI/patient and object membership. Calendar subscription shared-only; health UI gets own choices for limited roles. Scope/rulings: `legacy-object-visibility.md`. Media/input/proxy/bootstrap/reward/notification content/backup/log privacy/dependencies and F05 browser remain incomplete; no full foundation or Internet-readiness claim.
- F04-d source validation: Cloud Node24567/567 in57files, lint/build exit0. Actual RED→GREEN:30 object/ICS cases, four provider-session/patient-UI cases, two missing-proof/suite cases, one accidental note write-grant widening found during own diff review. Authorized behavior characterization remains alongside denials. An evidence fixture-order mistake produced one failure565/566; moving the new fixture name to the end retained the original path-normalization assertion. It is not counted as a production defect. Final source Windows567-test/16production-check proof and one fresh whole-branch review pending before merge. No dependencies/lock changes.

### F04-d review correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/10, first source HEAD `bd6831296b609be607087da12a921449b46c7655`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38166641562 independently read: both Windows2022 x64 Node22/24 each567/56757files, zero failed/skipped/todo; npm ci/native/lint/tests/build/production16checks exit0, evidence and ci-gate success. Full logs and both artifact sets/JUnit/JSON/hashes retained in `evidence/f04-d-first-source.json`.
- Fresh whole-branch review found two Important assistant authorization races, no Critical/Minor. One TDD pass: four regressions observed retry after revocation or200/private answers after object visibility loss, then GREEN. Authorized retry remains characterized. Live session/object checks precede every provider dispatch and follow its completion. Details and deferred acceptance/costs: `f04-d-review.md`.
- Corrected-source/final HEAD Windows remains pending. First-source evidence does not validate corrections. Media/input/proxy/bootstrap/reward/notification/backup/log privacy/dependencies and browser F05 remain required; Server2019 R02 unrun. No dependency or lock changes; no release/tag/VPS actions.
- Corrected Cloud validation:572/57257files, zero skips, lint/build exit0. Initial571/572 transport timing failure and deterministic-fixture correction retained in f04-d-review.md; production transport/deadline unchanged. All existing chunk/socket/uncertainty assertions remain.

### F04-d — corrected Windows implementation verified

- Corrected source HEAD `273b57c157a3366410cc96757b0c5cb3c5f59d7d`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38167343486, attempt1 success. Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each572/57257files, zero failed/skipped/todo. npm ci/native/lint/tests/build/compiled production16checks exit0; evidence and ci-gate success. Full logs and both JUnit/JSON/native/production artifacts independently read; hashes retained in `evidence/f04-d-corrected-source.json`.
- Native13.0.3/N-API10/SQLite3.53.4 with unchanged verified Windows binary. System32/Unicode roots, four launches/three graceful stops/crash recovery/write-denied/offline proof retained. No real provider calls. Two Important review findings fixed; no deferred Minor; deterministic transport fixture preserves assertions.
- This report belongs to source273b57c. Final documentation HEAD requires independent exact-SHA Windows acceptance; final proof URL/SHA/report hashes will be recorded on PR10 before its authorized merge.
- Remaining errors/gates: production audit6 entries (including one critical), development audit13, bundle >500kB warning; triage stays mandatory in F04/F09. Media/input/proxy/bootstrap/derivative and backup/log privacy pending. F05 browser/coverage/required checks and F06–F09/P/W/I02/I03/R01 remain incomplete; Server2019 R02 unrun. No release/tag/VPS action. Next: F04-e authenticated media from merged main.

### F04-d integration / F04-e source

- PR10 merged as `c2960a210570d68aa44650aacb846a23a266d63a` after exact final HEAD `a86857a79a12ddf18d6acf9fca2a7ae9cb86e024`, Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38167640833: both Node22/24 each572/57257files, all six exits0,16production checks/evidence/ci-gate success. Logs and artifacts independently read; proof https://github.com/DongVienNguyen/Family-Organizer/pull/10#issuecomment-6112795981.
- F04-e `codex/f04-authenticated-media`, BASE that squash. Existing media URLs are protected by current domain ACL and versioned owner/binding metadata in the I01 gateway/snapshot; migrated shared references survive cleanup. Strict path/link/content controls replace public static files. UI uses captured header fetch/owned blob cleanup, on-demand PDF actions, keyboard activation and generic invalidation. Details and costs: `authenticated-media.md`.
- Source Cloud642/64262files, zero skips, lint/build exit0.45 actual RED cases across HTTP/client/JSX/realtime/viewer/keyboard/evidence gates then GREEN; native rollback/migration/expiry/cold-restore and additional roles characterize preserved behavior. Initial627/628full run failed a new test's Headers-object assumption; `new Headers` normalizes the fixture while retaining the Bearer assertion. Reports retained. No dependency/lock update.
- PR/first Windows/fresh whole-branch review pending. Compiled media proof is required with all earlier probes. Full F04 and browser F05 remain incomplete; audit13total/6production and bundle warning remain explicit. No release/tag/VPS or Server2019 acceptance. Next after this reviewed exact-HEAD PR: remaining F04 input/proxy/bootstrap/privacy/dependency slices, then F05.

### F04-e — first Windows evidence and review correction

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/11, first source HEAD `55340d760cd7510cce33cbd27ce6945b91db7028`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38169379323 independently read: Windows2022 x64 Node22/24 each642/64262files, zero failed/skipped/todo; npm ci/native/lint/tests/build/compiled production17checks exit0, evidence/ci-gate success. Full logs and both JUnit/JSON/native/production artifacts read; hashes in `evidence/f04-e-first-source.json`.
- Fresh review found two Important/no Critical/Minor. One TDD pass: seven native Markdown false attachment claims and one actual Markdown anchor regression observed RED then GREEN. Reference-style managed first-binding/copy-denial characterization remains. Details/costs: `f04-e-review.md`. Explicit already-transitive unified11.0.5/remark-parse11.0.0 dependencies declared; lockfile updated, no package versions changed.
- Corrected-source/final Windows proof remains pending. First-source proof does not certify corrections. Real browser F05, remaining F04 input/proxy/bootstrap/privacy/dependency and later foundation tasks remain required; audit/bundle warnings retained. No release/tag/VPS/Server2019 acceptance.

F04-e correction validation: frozen npm ci, lint, full Cloud651/65162files zero skipped, build all exit0. Eight review RED→GREEN plus one preserved reference-style characterization. First Windows642 independently verified; corrected Windows pending before merge.

Corrected source7967efa/run38169992124 failed both Windows production startup and ci-gate: npm ci/native/lint/tests651/build succeeded, parser default-export interop in external CommonJS bundling threw "empty preset" before ready. Logs/artifacts retained in f04-e-corrected-source-failed.json; no production acceptance. Fix pass continues until green. Actual bundled CommonJS regression reproduced the same startup failure, then GREEN with named exports from existing mdast-util-from-markdown2.0.3/mdast-util-gfm3.1.0/micromark-extension-gfm3.0.0. These are now direct locked dependencies; unified/remark-parse remain transitive only. New missing compiled-suite proof observed RED then gate added. First new fixture attempts used a nonexistent preload path and omitted the production import.meta.dirname define; those were fixture setup errors, not production RED proof. No assertions weakened, no rerun unchanged and no re-review.

Named-export parser corrected Cloud acceptance: frozen npm ci/lint/tests653/65363files zero skips/build all exit0. Compiled parser1 and required suite evidence1 actual RED→GREEN; Windows final proof pending.

Source544c9d4/run38170534891: both Windows production17checks succeeded, but test command/ci-gate failed despite653 passed assertions because the new compiled-policy fixture teardown failed EBUSY/EPERM. The esbuild persistent service inherited fixture CWD. Source assertions and cleanup checks are retained; builder now runs in a bounded synchronous child from repo CWD, with ESBUILD_WORKER_THREADS=0 so its native process completes before return. No sleep, retry, teardown suppression or test skip. Failed reports/hashes retained in f04-e-parser-source-failed.json. Full corrected validation/Windows required before merge; no second review.

Owned-builder correction Cloud lint/tests653/65363files zero skips/build all exit0; unchanged frozen lock already installed. Native builder bounded to completed subprocess, all parser/destination/auth/coldrestore/cleanup assertions retained. Windows source retry follows fixture ownership correction, never unchanged rerun.

### F04-e — corrected Windows source verified

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/11. Corrected source HEAD `b2e1f370d555e2d9aa91ca534f2dcae3fef99655`, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38171014457 attempt1 success. Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each653/65363files; zero failed/skipped/todo. npm ci/native/lint/tests/build/production17checks all recorded exits0, evidence and ci-gate success. Full logs and both JUnit/JSON/native/production artifact sets independently read, hashes in `evidence/f04-e-corrected-source.json`.
- Native13.0.3/N-API10/SQLite3.53.4 verified unchanged binary. System32/Unicode roots, four launches/three graceful stops/crash recovery/write-denied/offline proof retained. Both previous failures are preserved with their causes, despite passed assertions/builds; no retry unchanged, skipped tests, softened assertion, teardown suppression or continue-on-error. Two Important review findings fixed in one ongoing pass until green, plus compiled parser/gate regressions; no Minor/re-review.
- This evidence belongs to sourceb2e1f37; final documentation HEAD requires separate exact-SHA Windows acceptance. Its immutable proof comment will record final SHA/run/report hashes before authorized merge.
- Remaining: F04 field/schema/proxy/bootstrap, reward/notification derivatives, provider/backup/log privacy and audit13total/6production entries (critical included); bundle >500kB warning retained. F05 real browsers/coverage/required-check enforcement and F06–F09/P/W/I02/I03/R01 remain incomplete; Server2019 R02 unrun. No release/tag/VPS action. Next: F04-f task payload/reward authority from merged main, then other remaining security slices.

Follow-up within review finding1: own tracing found the old Notes cleanup regex remained a second interpretation of destinations. Eight native regressions reproduced editing/deleting external/code/literal/unused-definition text deleting another actor's unbound staging file; one reproduced leaving a reference-style PDF orphan; two reproduced duplicate definitions interpreted last instead of CommonMark first. All11 actual RED→GREEN. Authorization and cleanup now share canonical managedMarkdownUrls with first-definition semantics. No new feature or re-review; one correction pass continues until final exact-HEAD verification. Prior documentation69d173c/run38171300389 is reported green by Actions but superseded by these source fixes and is not merge authority.

Canonical-destination follow-up validation: Cloud664/66463files, zero failed/skipped, lint/build exit0.11 additional regressions observed RED→GREEN. Same PR11; exact updated-source/final Windows proof pending. Prior653-test source evidence remains historical.

### F04-e — canonical destination implementation verified

- Source HEAD `caabd29621b4c5f1697a0735b590b21d28eda511`, PR https://github.com/DongVienNguyen/Family-Organizer/pull/11, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38171684606 attempt1 successful. Each Windows2022 x64 Node22/24:664/66463files, zero failed/skipped/todo; npm ci/native/lint/tests/build/production17checks recorded exits0, evidence and ci-gate success. Full logs/both JUnit/JSON/native/production report sets independently read; hashes in `evidence/f04-e-canonical-source.json`.
- Same reviewed correction pass closes both Important findings and their cleanup/parser consumers;66 total actual RED→GREEN cases, including11 canonical cleanup/duplicate-definition regressions. Existing reference ownership/tombstones/rollback/coldrestore/roles/async cleanup retained. Named parser dependencies are existing locked transitive versions, now explicit. Two failed Windows source runs remain recorded, with fixes and no assertion weakening.
- Final documentation HEAD still requires exact-SHA Windows verification before the authorized merge; final proof comment records its SHA/run/hashes. Remaining errors/gates and next F04-f task payload/reward authority are unchanged; no fullF04, browser, Server2019, release/tag/VPS acceptance.

### F04-e integration / F04-f source

- PR11 merged as `b414a8165235a5aafcec5144a844fdd852e9829f` after final HEAD `c2b0f88c62766afa06ca8d31e2ad0ee12cb6a2cb`, Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38171963503: both Node22/24 each664/66463files, all six exits0,17production checks/evidence/ci-gate success. Full logs/artifacts independently read; proof https://github.com/DongVienNguyen/Family-Organizer/pull/11#issuecomment-6113386990.
- F04-f branch `codex/f04-task-write-authority`, BASE that squash SHA. Native current actor/field/schema/approval guards preserve daily task/edit/comment/approval/recurrence/rotation/reopen and reward once. Child zero-point creation remains; adults own reward allocation/positive-reward assignment and sharing is creator/adult only. Full read-model/unchanged legacy extensions retain canonical values. Details/rulings/limits: `task-write-authority.md`.
- Cloud755/75566files, zero skips, lint/build exit0.85 actual RED→GREEN regressions plus six preserved characterizations. Initial target136/137 exposed a synthetic fresh DTO timestamp mismatch; first full752/754 exposed a lifecycle fixture's ignored assignedToId. Fixtures now follow actual contracts; all old assertions retained, persisted assignee assertion added. Logs remain. No dependency/lock change.
- PR/source Windows/fresh whole-branch review pending. New compiled task authority18th proof required; no claim from Cloud alone. Other F04 payloads/proxy/bootstrap/derivative/provider/backup/log privacy and audit13total/6production (critical included), bundle warning, F05 real browsers and F06–F09/P/W/I02/I03/R01 remain incomplete; Server2019 R02 unrun. No release/tag/VPS action.

### F04-f — reviewed correction ready for Windows

- PR https://github.com/DongVienNguyen/Family-Organizer/pull/12; source9c6a37ba9b026f9e9b1b9fc4ecceda2c4055933b, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38173723810 independently verified: both Windows2022 x64 Node22/24 each755/75566files, zero failed/skipped/todo; npm ci/native/lint/tests/build/production18 checks all exits0, evidence/ci-gate success. Full logs and both JUnit/JSON/native/production artifact sets read; hashes in evidence/f04-f-first-source.json.
- Fresh whole-branch review one Important/one Minor accepted, no Critical; graded before mutation then one TDD fix pass/no re-review. Unchanged historical assignee/rotation now stripped and retained while newly assigned deleted IDs remain rejected. Actual native deleteUser/adult allocation plus HTTP editor-payload assertions preserve ordinary Child rewarded-task editing. Localized sharing help has actual rendered aria association. Details/costs/declined gates in f04-f-review.md.
- Corrected Cloud frozen npm ci/lint/tests762/76266files/build exits0, zero skips.90 actual RED→GREEN plus eight characterizations total; no dependency/lock changes or lowered assertions. Corrected source/final exact Windows is pending before merge. Other F04/F05–F09/P/W/I02/I03/R01 and R02Server2019 remain incomplete; no release/tag/VPS. NextF04-g content write authority from actual merged main.

### F04-f — corrected Windows source verified

- Reviewed source HEAD `461e28a5b679bb72ca4ed33539990bdd1ef1ceac`, PR https://github.com/DongVienNguyen/Family-Organizer/pull/12, CI https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38174265137 attempt1 success. Windows2022 x64 Node22.23.3/npm10.9.9 and Node24.21.0/npm11.19.0 each762/76266files, zero failed/skipped/todo; npm ci/native/lint/tests/build/production18 checks all recorded exits0, evidence/ci-gate success. Both full artifact sets and logs independently read, hashes in evidence/f04-f-corrected-source.json.
- One Important and one Minor fixed in a single reviewed TDD pass;90 actual RED→GREEN and eight characterizations. No source assertions dropped, skipped tests, dependency/lock changes or unchanged failed-run retries. Native13.0.3/N-API10/SQLite3.53.4 retained.
- Final documentation HEAD needs its own exact-SHA Windows verification; immutable proof comment records final SHA/run/report hashes before authorized merge. Remaining F04 payloads/proxy/bootstrap/derivative/provider/log/audit and F05–F09/P/W/I02/I03/R01 remain incomplete; browser/PWA and Server2019 R02 unrun. No release/tag/VPS action. Next focused taskF04-g content write authority from merged main.

### F04-f integration / F04-g source

- PR12 merged as `7efdb40ba591bdf0364cb92ab277c8ca461a57df` after final HEAD `8aa52999036c2b2232bc5a75dab11602efee06d1`. Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38174580999: both Node22/24 each762/76266files, zero skips, all six exits0,18 production checks/evidence/ci-gate. Full logs/artifacts independently read; final proof https://github.com/DongVienNguyen/Family-Organizer/pull/12#issuecomment-6113740334.
- F04-g branch `codex/f04-content-write-authority`, BASE that squash SHA. Current live actor/context, existing role/object management, immutable creator/timestamps and changed-value schema checks now apply inside native Notes/Plans/Documents commands. Notes content grants do not delegate privacy/edit-role changes. Unchanged canonical read-model values/extensions are retained; omitted document files retain attachments. HTTP shape guards are pure, preserving F03 app construction; details/costs in legacy-content-authority.md.
- Cloud frozen npm ci/lint/build exits0; full850/85069files with zero skips.79 regressions observed RED→GREEN and nine preservation/boundary characterizations; existing assertions retained, no dependency/lock changes. New required suites and19th compiled content authority proof. PR/source Windows/one fresh whole-branch review pending. Remaining F04 derivatives/proxy/bootstrap/provider/backup/log/audit (13 findings, critical included), bundle warning and F05–F09/P/W/I02/I03/R01 remain incomplete; Server2019 R02 unrun. No release/tag/VPS.

### F05 — concrete repository enforcement blocker

- Read main protected:false, rulesets:[], integration-reported admin/maintain/push:true; actual ci-gate check publisher GitHub Actions app15368 verified. Attempted POST repository rulesets and fallback PUT main protection with PR+strict required ci-gate/no bypass. Both gh exits1, HTTP403 Resource not accessible by integration. Exact requests/responses are in evidence/f05-enforcement-blocked.json. No enforcement or failing-PR merge-block proof claimed; with enforcement absent, no unsafe failing merge attempt was made.
- Required external action: grant the integration GitHub Administration:write, or repository owner applies equivalent settings; then read back policy and verify a failing synthetic PR is blocked. This access question is pending asynchronously while independent source/CI continues. Browser/coverage and remaining F05 work are still pending. No token, production credential, PC runner, release or VPS requested.

## F04-g — Content writes and historical-value preservation

- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/13; BASE7efdb40, first source9730254f4b390341807684749bc5b8ff3a7f1b1b.
- First Windows: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38176066061. Both Node22/24: npm ci/native/lint/test/build/production/evidence all successful;850/85069files, zero skips,19 compiled production proofs and ci-gate. Full logs/JUnit/JSON/native/production artifacts independently read; hashes in evidence/f04-g-first-source.json.
- Current actor/context and native Notes/Plans/Documents management guards, typed header/changed-field validation, server-owned creator/timestamps, Notes delegated editor privacy controls/localized help, omitted attachment preservation and reserved URL roundtrip rejection. Existing role/object rights and genuine409/cache ordering retained.
- Fresh single whole-branch review: noCritical, twoImportant accepted/fixed in one TDD pass (retained attachment historical fields; downstream canonical type/title preservation), noMinor/no rereview. Seven more actualRED regressions and three rejection characterizations; corrected Cloud lint/full860/86069files/build all exit0, zero skips. Frozen lockfile unchanged; exact corrected/final Windows pending. No dependency/lockfile changes.
- Browser/PWA and coverage F05, other F04/privacy/provider/bootstrap/dependency work, package/service F06/F07, performance F09 and Server2019 R02 remain. F05 ruleset and branch-protection writes are actually blocked403; evidence/f05-enforcement-blocked.json contains exact requests/responses. No release/tag/VPS operation.
- Next: corrected full Cloud validation, exact corrected/final Windows logs/artifacts, authorized merge; continue remaining F04 and independent F05–F08 preparation.

- Corrected F04-g source ec772661516ad2549cb0604777b2a3a5c56e4fe6: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38176775633 independently verified both Windows Node22/24,860/86069files zero skips; all six command exits0,19 compiled proofs/evidence/ci-gate. Full logs/JUnit/JSON/native/production artifacts and SHA256 recorded in evidence/f04-g-corrected-source.json. Final documentation HEAD must pass its own run before merge; immutable PR proof comment records that exact SHA.

## F04-g merge and F04-h derived privacy

- PR13 final HEAD7a46a62adbb8c6175d0922f06c9038fb27e61884 independently passed exact Windows run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38177081124 on Node22/24:860/86069files per runtime, all six command exits0,19 compiled proofs/evidence/gate. Full logs/JUnit/JSON/native/production artifacts/hash proof: https://github.com/DongVienNguyen/Family-Organizer/pull/13#issuecomment-6114087923. Authorized squash main67bffd8650de46d95d2d4f697ce5251f3a56954e.
- F04-h branch codex/f04-derived-object-privacy starts from that actual merge. Current source ACL now filters/redacts task-derived reward history, notifications/read acknowledgments/push badges and private-document activity details. Family point balances/items/history data remain canonical; new optional source metadata is internal. No new Wallet functionality or API. See derived-object-privacy.md for explicit historical redaction costs.
- TDD:24actualRED+4chars, evidence3actualRED ->27actualRED/four chars. Cloud frozen npm ci/lint/tests891/89171files/build all exit0, zero skips; no deps/lock changes. Existing mocked HTTP ACL read port updated without removing assertions.20th compiled proof added. First source PR/exact Windows and one fresh wholebranch review pending.
- Other F04 and F05–F09 remain incomplete. Main protected:false and rulesets:[] read back after F05 writes403; negative failing-PR enforcement proof remains blocked. Browser/coverage/package/service/provider/bootstrap/dependency and Server2019 gates are not inferred from these tests. No release/tag/VPS operation.
- Next: source commit/PR, exact Windows and fresh review; grade findings, one correction pass, final exact verification and authorized merge, then continue remaining foundation.

- F04-h PR: https://github.com/DongVienNguyen/Family-Organizer/pull/14; first sourceb56de22a6860e3bddf033919498dc82a38757079 Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38177773857 independently891/89171files per runtime, all six exits0,20 compiled proofs/evidence/gate. Full logs/artifacts/hashes in evidence/f04-h-first-source.json.
- One fresh wholebranch review found threeImportant/noCritical/noMinor: adult unproven system content, source-bearing historical IDs/extensions/push tags, frozen medication/vaccination patient markers. All accepted before mutation,25actualRED+two chars added, corrected in one pass/no rereview.110 target assertions GREEN; corrected Cloud lint/full918/91871files/build all exit0, zero skips; frozen lock unchanged. Exact corrected/final Windows pending. See f04-h-review.md for costs/limits.52actualRED/six characterizations in this focused PR.

- F04-h corrected source887367f06266425947fd89b15740ea236c40c785: https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38178880558 independently verified both Windows Node22/24,918/91871files zero skips, six command exits0,20 compiled proofs/evidence/ci-gate. Full logs/artifacts/JUnit/JSON/native/production hashes in evidence/f04-h-corrected-source.json. Final documentation HEAD still requires its own run; immutable PR proof records exact SHA before authorized merge.

## F04-h merge and F04-i HTTP dependency security

- PR14 final HEAD63ef3adad4450b9357626487ac666a4a5e6020fe independently passed Windows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38179151696: bothNode22/24 each918/91871files zero skips, all six command exits0,20 compiled proofs/evidence/ci-gate. Full logs/JUnit/JSON/native/production artifacts/hash proof https://github.com/DongVienNguyen/Family-Organizer/pull/14#issuecomment-6114418887. Authorized squash621a6a2213da0c35028f42fb3138788cecc46c8f; threeImportant one correction pass52actualRED/six chars, noMinor/no rereview.
- F04-i branch codex/f04-http-dependency-security starts from that actual squash. Only four compatible HTTP package nodes updated and Express4 exact-pinned; lock updated.13 actual securityRED plus one required-suiteRED, four behavior characterizations. Cloud frozen npm ci/lint/full936/93672files/build all exit0; no dropped assertions/skips. Target83/83 including inherited login throttling. Audit13→9, critical1→0 but high5/moderate4 remain; both audit exits1. See http-dependency-security.md/evidence/f04-i-http-dependencies.json. PR/source Windows and one fresh wholebranch review pending.
- Other F04/bootstrap/provider/backup/log and F05–F09/browser/package/service/performance remain incomplete. Main protection:false/rulesets[] still read back after APIs403; enforcement proof blocked. Server2019 R02 unrun; no release/tag/VPS. Next: source Windows/review, grade and correct once if needed, final exact Windows verification/authorized merge, continue foundation.

- F04-i PR https://github.com/DongVienNguyen/Family-Organizer/pull/15; firstHEADc1b216754f7dc3cf46858123960e6d6a4a79be07 exactWindows https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38179696236 independently verified both936/93672files/sixexits0/20production/evidence/gate. Full logs/artifacts/hash in evidence/f04-i-first-source.json. One fresh review noCritical/Important, oneMinor accepted and fixed once via two actualRED HTTP deadline/abort cleanup regressions. Total16actualRED/four chars; target85/85, corrected Cloud full938/93872files zero skips lint/build0. Same patched lock/frozen install; final exact Windows pending. No re-review or remaining Minor; other foundation gates remain.

## F04-j — Explicit first account / credential input (in progress)

BASE/main `26953ea8015ba4925bf61fd34ae4a6d942b6d7cd` verified after authorized
PR15 squash. Prior exact HEAD `e22b542cc531b1ad1edea0df4a0de1da594cc3a4`, Windows
https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38180187720:
938/93872files per runtime; six command exits0,20 compiled proofs, evidence and
ci-gate verified independently; final proof PR15 comment6114591137.

F04-j bounds login types/bytes and current session roles/hash shapes; preserves
opaque sessions and historical password verification. New compiled local operator
reads bounded stdin, creates exactly one chosen Admin through the existing gateway,
and refuses selected legacy/partial/initialized data. No default credentials,
public bootstrap API, guessed repair or reset. Actual SQLite/login/restart and
unchanged logical-row regressions retained. README removes obsolete default login.
No dependencies changed; frozen lockfile retained. See `account-initialization.md`.

Observed RED:16 existing auth input/session vulnerabilities, blank default-account
startup, stale JSON overwriting userless partial SQLite, two required-evidence
omissions (20 actual RED). Twelve initializer tests initially failed because the
required operator entry was absent; five auth cases characterize existing valid or
already rejected behavior. The first implementation exposed an omitted empty
server_metrics table; all original assertions retained when the pristine whitelist
was corrected. Focused native/auth tests76/76 passed; frozen npm ci, lint, full975/97573files
(zero skips), build and Linux compiled-entry smoke passed. Full-suite changes
retain existing assertions: explicit synthetic input for media/cold/crash recovery;
safe db.json error context. Fresh review, PR URL, exact SHA and Windows artifacts pending. No CI-pass claim yet.

F05 authorized permission retry still returned HTTP403 for both ruleset POST and
branch-protection PUT; main protected:false and rulesets:[] confirmed. User approval
in chat does not change installation permissions. Available tools cannot grant
Administration:write. Concrete requests/responses saved in
`evidence/f05-enforcement-blocked.json`; external GitHub owner/integration permission
application remains required. This was a GitHub authorization failure, not an
automatic approval rejection. Independent foundation source work continues.

Next: exact Windows Node22/24 first-account compiled proof, one fresh review and
one correction pass if needed, then authorized merge; remaining provider/backup/log
privacy, browser/coverage, packaging and service preparation. PowerShell initializer
wrapper is F06; reset/encrypted recovery F07; Server2019 acceptance R02 unrun.
No releases, tags, VPS access/deployment or new domain features.

### F04-j — First Windows artifacts / single review

PR https://github.com/DongVienNguyen/Family-Organizer/pull/16, first source HEAD
`05d24c4df334c1334f51ae01e852dfd0276c53e4`, Windows
https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38182062049.
Both pinned runtimes:975/97573files, zero failed/skipped, npm ci/native/lint/tests/
build/production exits0,21 compiled proofs, evidence and ci-gate successful.
Full logs, JUnit/JSON/native/production and hashes independently read in
`evidence/f04-j-first-source.json`. This report belongs only to that first HEAD.

One fresh whole-branch review: no Critical/Minor; one Important accepted before
mutation. Existing SQLite import changed schema/journal metadata before refusing
foreign, incomplete or unsupported installations. Three actual native RED cases
retain exact sqlite_master/logical rows/journal mode and closed ownership. The
same-connection internal first-account mode now inspects under IMMEDIATE before
DDL/meta; the final gateway guard remains. Compiled production probe adds the
same three refusals. Total23actualRED,12initially absent operator requirements,
five characterizations. No dropped assertions, dependencies, skip or rereview.
Corrected Cloud lint/full978/97873files (zero skips)/build and compiled smoke
passed; frozen lock unchanged. Final source/docs need their own exact Windows run
before authorized merge.

Broader F04/provider/backup/log/audit gates remain incomplete; F05 enforcement
still blocked by actual GitHub403 despite authorized retry. Package, masked PS
wrapper and normal runtime unsupported-schema acceptance are F06; service/reset/
encrypted recovery F07; release/promotion preparation F08; full app browser/
performance F05/F09. Server2019 R02 remains unrun; no release/tag/VPS operation.

## F04-k — Remaining library advisories (in progress)

BASE/main `e41e97d35f538f62f123ccfb1558425627ece3da` verified after authorized
PR16 squash. Previous final HEAD `cc45fe894caf8e70a1f20f57af4b7b35483ffb55`, run
https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38182693480:
both Node22/24 independently978/97873files, zero skips, six command exits0,
21 compiled production/evidence/ci-gate; proof PR16 comment6114910877.

F04-k fixes the remaining public advisory ranges with a scoped18-node lock update
plus exact Vitest root pin. Seven affected libraries use published minimum fixes;
eight Vitest ecosystem nodes stay together; three compatible browser datasets
satisfy the patched Browserslist minimums. No package paths added/removed, native
or Node runtime upgrade. Metadata/engines/licenses and seven downloaded tarball
integrities verified. npm audit9(0critical,5high,4moderate)→0; actual exits1→0.
See `library-dependency-security.md` and `evidence/f04-k-library-dependencies.json`.

Actual RED19 library cases plus one required-evidence omission;9 existing safe or
valid characterizations retained. Owned offline child processes bound heap,
startup/execution, output and cleanup for parser/generator/brace/mapping inputs;
PostCSS source map and indexed offset/browser stats regressions use synthetic
fixtures. Final selected minimum-version frozen npm ci, audit exit0, lint, full1007/1007
74files (zero skips) and build passed; captured child output additionally bounded
without changing library assertions. PR URL, SHA, exact Windows results and fresh
whole-branch review pending; no final CI-pass claim.

Remaining F04 provider/backup/log/privacy and final proxy/browser gates; F05
browser/coverage/enforcement still incomplete, actual protection writes403 despite
user authorization. F06 packaging/wrapper/schema, F07 service/encrypted recovery,
F08 release preparation, F09 full regressions/performance remain. No release/tag,
VPS access/deployment, Server2019 acceptance or new domain features.
