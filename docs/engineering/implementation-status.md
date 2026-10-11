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
