# Tiến độ Windows-native

## F01 — Baseline/Windows CI bootstrap

- Source HEAD: `68cb753c13c35e13dd120b217040aa12365e3b40`; planning baseline:
  `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`; diff chỉ7tài liệu.
- Branch: `codex/f01-windows-baseline`; commit triển khai/PR URL: pending first push.
- CI run URL: pending Windows Actions. Chưa tuyên bố CI Windows pass.
- Cloud Node22.23.3/npm10.9.9/Linux x64: npm ci, lint, tests127/127, build và native
  SQLite rollback/WAL/cleanup đã pass; bộ gốc122/122. Reports trong `/workspace/family-evidence`.
- Windows Node22/24: not-run tại lần ghi này; Server2019 R02: not-run.
- Root causes đã sửa: updater trỏ repo nguồn; fixture cleanup bỏ qua SQLite file locks.
  Regression close/repos đã quan sát fail trước sửa, pass sau sửa; không skip assertions.
- CI cũ Linux Node22 tại source HEAD:
  https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38130931355 (success).
- GitHub API ban đầu proxy403; đã thêm `api.github.com` vào draft network và retry thành công.
  Git read/push dry-run và GitHub API quyền push/admin đã xác minh; không cấp thêm token.
- Next: push PR bootstrap, đọc Windows logs đúng HEAD; sửa addon/runtime nếu probe fail,
  lưu artifacts/evidence, chỉ chọn Node24 khi compatibility được chứng minh.
- Sau review/merge F01: PR F02 scripts/path config; F03 lifecycle; I01 gateway theo plan.
  F02–F09/I01 chưa được thực hiện. Chưa merge, release hoặc truy cập VPS.
