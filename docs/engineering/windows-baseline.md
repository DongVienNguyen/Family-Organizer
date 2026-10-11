# F01 — Windows-native baseline

Ngày 11/10/2026. Repo duy nhất: `DongVienNguyen/Family-Organizer`; remote fetch/push
`https://github.com/DongVienNguyen/Family-Organizer.git`, default branch `main`.
Checkout ban đầu: branch Cloud `work`, clean, HEAD
`68cb753c13c35e13dd120b217040aa12365e3b40`.
SHA khảo sát trong plan: `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`.
Chênh lệch: một commit `docs: add Windows-native roadmap and Codex Cloud implementation guides`,
7 file tài liệu, 1871 dòng thêm; **không đổi source, tests, manifests hoặc lockfile**.
Branch thực thi: `codex/f01-windows-baseline`. HEAD/PR/run mới được ghi trong
[implementation-status](implementation-status.md), không đồng nhất SHA khảo sát với HEAD PR.

## Toolchain và quyết định runtime

[Manifest](windows-toolchain.json) pin exact Node22.23.3/npm10.9.9 (ABI127) baseline,
probe riêng Node24.21.0 LTS/npm11.19.0 (ABI137), x64. Phiên bản lấy từ Node official
dist index; SHA256 Windows ZIP lấy từ SHASUMS256 chính thức. `.node-version` hiện giữ
Node22. Không promote Node24 chỉ từ source review hoặc kết quả Cloud.

Lockfile baseline: better-sqlite3 11.10.0, React19, Express4, TS5.8, Vite6,
Vitest4.1.8. Vite khai báo cả dependencies và devDependencies; cleanup chỉ thực hiện
khi quyết định runtime/addon, không nâng toàn bộ dependency. @types/node22 hiện phù hợp baseline.
Npm cài frozen lock bằng `npm ci`, giữ TLS và integrity checks, không ignore-scripts/force.

Upstream better-sqlite3 v11.10.0 có prebuilt Windows x64 ABI127 nhưng **không có ABI137**
(đã đọc assets API release chính thức). Windows Node24 job sẽ chứng minh khả năng
compile/load hoặc ghi failure thật. Manifest artifacts ghi addon version, SQLite version,
ABI và SHA256 binary đã load; install.log phân biệt prebuilt với compile fallback.
Chưa lựa chọn WinSW/Caddy cho production trong PR bootstrap; kiểm checksum/toolchain đó
thuộc PR service/package sau. Server2019 chưa được nghiệm thu: R02 not-run.

## Workflow và storage/lifecycle đã đọc

`dev`: tsx server.ts (Express + Vite middleware); `lint`: tsc --noEmit;
`test`: vitest run; `build`: Vite frontend + esbuild CJS server; `start`: dist/server.cjs.
`clean` dùng rm, `release` dùng Bash, sẽ thay ở F02; không gọi trong CI Windows mới.
CI cũ Node22/Ubuntu đã đạt tại [run 38130931355](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38130931355)
cho HEAD `68cb753…`; đó **không phải bằng chứng Windows**.
Workflow Pi/ARM64/Docker/GHCR release đã gỡ; F08 sẽ thay bằng Windows release có gate riêng.

SQLite mở singleton lúc import, WAL/foreign_keys/busy_timeout, 26 collections JSON
theo id/seq và singleton app_meta. sqliteSave DELETE/INSERT mọi collection trong một
transaction. db.ts bootstrap legacy db.json hoặc synthetic blank admin. DATA_DIR hiện
theo cwd; media/settings/backups/update mailbox cũng theo cwd. DATA_DIR tập trung ở F02,
gateway/dirty writes/registry/snapshot ở I01. sqliteClose nhỏ được thêm để regression
và fixture cleanup giải phóng handle; chưa thay lifecycle toàn app.

server.ts mở timers/jobs ở module scope và startServer cuối module: updater,
telemetry, market fetch, Telegram/digest, reminders và backup. Không expose stop/dispose;
listen 0.0.0.0; metrics có /proc,/sys. F03 xử lý lifecycle/telemetry và bỏ Docker updater
routes/UI. F04 xử lý auth/media. F01 không start full server hoặc gọi provider thật.
Full backup có thể chứa app_settings/API key: ownership I01/F07, không upload fixture DB/settings.

## Tests, coverage gaps và owner

Bộ gốc: 9 files / 122 tests (7 utils, ICS, legacy updater). Không có HTTP integration,
browser, service/package, migration/restore full suite. Các helper tests không chứng minh ACL.
PR thêm 4 SQLite tests (order/Unicode/singletons, transaction rollback, committed WAL
backup/reopen/integrity, close idempotent/file delete) và 1 updater repository regression.
Fixture cleanup không nuốt lỗi Windows; test imports dùng synthetic temporary cwd,
fetch ngoài fixtures bị chặn, credentials provider bị bỏ khỏi worker env.

| Module/route family | Tests hiện có | Ownership phần chưa kiểm |
|---|---|---|
| Auth/users/profile/settings | chưa HTTP tests | F04/F05/F09 |
| Tasks/rewards/comments/approval | recurrence helper | F05/F09, P10/I01 characterization |
| Finance/budgets/categories/bills/goals/debts/assets | financePeriod/debt/assetValue helpers | F05/F09 |
| Plans/calendar/ICS | ICS + recurrence + holidays helpers | F05/F09 |
| Notes/documents/uploads | chưa route/ACL tests | F04/F05/F09 |
| Shopping/meal plan | chưa tests | F05/F09 |
| Medications/child health | BMI helper | F04/F05/F09 |
| Search/dashboard/widgets/market | searchText helper | F04/F05/F09 |
| SSE/notifications/web push | chưa tests | F05/F09 |
| Assistant/notes AI/settings AI | chưa tests, offline fixtures cần bổ sung | F04/F05/F09 |
| Telegram/digest | chưa tests, delivery phải mock | F05/F09 |
| Backup/restore/logs | SQLite WAL primitive, không full snapshot | I01/F07/F05 |
| System/version/update/Immich/telemetry | legacy updater helper/mailbox | F03/F05/F08 |
| PWA/static/i18n/theme | chưa browser tests | F05/F09 |

[Inventory từng route](windows-route-inventory.json) map mọi literal route và ghi
static/PWA mounts riêng; chưa có HTTP contract suite nào đạt. Tính năng flag-off
cũng cần test ở F05/F09. Không coi 127 tests là regression toàn bộ app.

## Evidence contract và giới hạn

CI bootstrap: windows-2022/pwsh/x64, hai jobs Node22/24 độc lập, fail-fast false,
không continue-on-error. npm ci → native probe/lint/test/build; lint hoặc test đỏ vẫn
thu thập các check độc lập còn lại, gate cuối vẫn đỏ. Mỗi native/npm command kiểm exit
ngay và lưu log/exit JSON. Reports thiếu, zero/skipped tests hoặc sai SHA/runtime/OS
làm evidence check fail. Artifacts `reports/` giữ14ngày, không chứa DB/secrets/node_modules.
Checkout PR **HEAD**, không dùng merge SHA để chứng minh HEAD; evidence có run URL/attempt,
OS/image version, Node/npm, suites/counts, ABI/addon hash và Server2019 not-run.
`ci-gate` chưa được cấu hình ruleset required ở F01; enforcement thuộc F05.

Cloud Linux x64 kiểm độc lập: npm ci Node22 pass, bộ gốc122 pass, bộ mới127 pass,
lint và build pass, native load/rollback/WAL/cleanup pass. Build cảnh báo chunk >500kB
(owner F09/performance); chưa tối ưu hoặc giảm threshold. Install đầu trên Node24.19.0
Cloud fail vì node-gyp cache ngoài sandbox; chuyển Cloud sang Node22 và cache workspace,
không dùng lỗi đó để kết luận Windows Node24. Cloud dependencies không đóng gói Windows.
Kết quả Windows, CI failures/corrections và exact run links nằm trong status/evidence.

Tài liệu README/CLAUDE/AGENTS cập nhật hướng Windows; guide/site cũ gắn nhãn lịch sử
và đổi repository links. Dockerfile/compose/deploy updater còn lại chỉ là migration input
cần retire ở F03/F08, không nằm trong pipeline mới. Thông tin author/license được giữ.
Không release, merge, đọc production data hoặc truy cập VPS trong F01.

Thứ tự tiếp theo: review/merge F01 → F02 paths/scripts → F03 lifecycle → I01 → F04/F05
→ F06/F07 → F08/F09. Chưa có số đo service/package/restore để chốt effort toàn giai đoạn;
re-estimate sau failures Windows và throughput các PR, không biến ước lượng plan thành deadline.
