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

## F02 — Native scripts / config roots (in progress)

- Branch `codex/f02-native-paths`; BASE/main `903e6401f33fa08ad8b95fc3e4865dff27fa45c0`. Focused dependent PR will be recorded after creation; Windows results pending, no pass claim yet.
- Implemented source: stable code/data/config/log roots; production absolute external DATA_DIR; selected configRoot dotenv; actual write checks; rooted media/DB/settings/updater/static assets. Corrupt legacy JSON fails instead of silently seeding a new family.
- Native clean/changelog scripts; old Bash release removed and release command explicitly disabled. Explicit offline copy migration has dry-run/report/backup, SQLite staging, integrity/hashes, source preservation and refusal of overlapping/existing/linked targets. See `native-paths.md`.
- Vite and its two build plugins moved to devDependencies after lazy-loading development Vite. Production-only install previously retained tsx via Vite's optional peer. Lockfile changes dependency classification only: no package versions, additions or removals.
- Cloud RED: root/scripts/migration contracts; corrupt legacy import; provider .env must not change launch roots/NODE_ENV; production evidence missing/wrong SHA/checks. GREEN whole suite161tests/14files, lint/build (before final CI/reviewer updates). Do not interpret Cloud as Windows.
- Windows CI adds production-only clean layout, System32 cwd, static/PWA/login/legacy IDs/restart, ACL-denied write startup, blocked external providers, explicit exit/log/evidence and finally process/ACL/file cleanup. Windows execution pending.
- Real SQLite finding: readonly opens create source WAL/SHM. Migration opens only a private copied database, keeps original source untouched. This offline copier does not replace the online snapshot engine required by I01.
- Remaining/unrun: portable ZIP F06; graceful lifecycle F03; HTTP/browser/full regression F05/F09; service/online restore F07/I01; R02 Server2019; release/VPS gates remain unauthorized. Existing chunk-size warning stays F09.
- Next after F02 review/merge: F03 lifecycle/telemetry/remove Docker updater. Later PRs require review; do not silently merge to advance the plan.

### F02 — PR/review and first actual Windows failures

- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/2 (open; do not merge without review/authorization).
- First Windows HEAD `92621a84cd7d2f6e0d622ab23511dba754ebdf98`; run https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38138220750 failed. Logs read: Node24 unit worker native ObjectWrap abort (156passed of161;13of14files); both production smokes rejected retained TypeScript; ci-gate correctly failed. No pass claim for that SHA.
- Root cause isolated: i18next optional TypeScript peers remain under production install; browser i18next packages moved to devDependencies. SQLite11.10.0/Node24.21.0 failed allocation-driven statement GC (SIGABRT), matching nodejs/node#65446. Pin13.0.3 N-API to remove the ObjectWrap path; retain Node22/24 pins. Lockfile removes obsolete native prebuild-install dependencies and adds node-addon-api; no unrelated major upgrades.
- New deterministic native-GC regression RED on11.10.0 → GREEN13.0.3; actual loaded native binary is hashed rather than assuming old build/Release location. Cloud SQLite3.53.4. Windows startup/native/GC compatibility rerun pending.
- Fresh review: three Important path/migration findings (Windows root-relative paths, report alias via ancestor junction, invalid JSON-only migration) addressed with RED→GREEN tests. Restart smoke strengthening also requires a post-import mutation survive restart, not merely the same legacy JSON read twice. See `f02-review-and-decisions.md`.
- Remaining blockers: Windows rerun/final artifacts pending; next PRs await user review and separate merge approval. Full plan is not complete; no release or VPS access.
