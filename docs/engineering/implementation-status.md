# Tiến độ Windows-native

## F01 — Baseline/Windows CI bootstrap

- Repo: `DongVienNguyen/Family-Organizer`, base `main`, branch `codex/f01-windows-baseline`.
- Source checkout SHA: `68cb753c13c35e13dd120b217040aa12365e3b40`;
  planning baseline `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`; diff chỉ7tài liệu.
- PR: https://github.com/DongVienNguyen/Family-Organizer/pull/1 (open; không merge).
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
- Pending verification: commit runtime/toolchain/evidence corrections sau bootstrap
  phải được CI lại đúng PR HEAD. Không dùng bootstrap SHA để gọi HEAD mới đã pass.
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
- Next: đọc run mới đúng HEAD, sửa failure thật và cập nhật evidence. Sau PR được
  review/merge: PR riêng F02 scripts/path configuration; rồi F03 và I01 theo dependency.
