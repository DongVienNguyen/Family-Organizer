# Family-Organizer — nền tảng Windows-native và cổng phát hành

> **F01 checkout verification (11/10/2026):** HEAD thực thi ban đầu là
> `68cb753c13c35e13dd120b217040aa12365e3b40`, sau baseline
> `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91` đúng một commit thêm7tài liệu;
> source/tests/dependencies không đổi. Xem [baseline](../../engineering/windows-baseline.md)
> và [implementation status](../../engineering/implementation-status.md) cho SHA/PR/CI thực.
> Các tuyên bố khảo sát bên dưới là lịch sử; không dùng chúng làm bằng chứng CI hiện tại.


**Repo thực thi:** [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), public, branch `main`; HEAD đã xác minh trùng baseline bên dưới. CI, package và release chỉ dùng repo này. F01 phải rà cả repo URL hard-code trong updater/workflows/docs còn kế thừa từ source trước đây; thay bằng repo đích hoặc `github.repository` phù hợp, giữ nguyên thông tin tác giả/license.

Ngày rà soát: 11/10/2026. Đây là plan thực thi, **chưa có code chuyển đổi, CI pass hoặc nghiệm thu VPS**. Repo được đọc tại commit `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`. Các file đề xuất bên dưới cần được tạo trong repo Family-Organizer khi thực thi trên Codex Cloud.

**Goal:** Phát triển trên Codex Cloud; build và kiểm thử chuẩn trên GitHub-hosted Windows; chỉ cài bản phát hành đã đạt CI lên Windows Server 2019. Không cần PC cá nhân chạy Node, database, browser tests hay runner.

**Architecture:** Giữ modular monolith React/Express/SQLite. Windows x64 chạy Node như Windows Service, Caddy native phục vụ HTTPS/reverse proxy. Gói ZIP bất biến chứa runtime và dependencies Windows. Dữ liệu nằm ngoài release. Có một writer/gateway, migration registry và snapshot chung theo I01 trong [master](2026-10-11-family-organizer-upgrade-master.md).

**Tech stack:** Giữ React/TypeScript/Vite/Tailwind/i18next/Express; chọn Node 24 LTS x64 và bản better-sqlite3 tương thích qua F01, khóa exact runtime và lockfile. PowerShell 7.x tương thích Server 2019 cho automation; WinSW stable đã pin/checksum cho service. Không nâng đồng thời mọi major dependency. Node 22 chỉ là baseline hiện tại, không mặc định giữ vô thời hạn.

## 1. Các kết luận có bằng chứng

| Điểm cần tối ưu | Bằng chứng repo | Thay đổi được đưa vào plan |
|---|---|---|
| CI chưa chứng minh Windows | `.github/workflows/ci.yml`: ubuntu-latest, Node22, shell syntax checks | F05: windows-2022, pwsh, unit/integration/E2E/package/service tests |
| Release gắn với Pi/Docker | `.github/workflows/release.yml`: ubuntu-24.04-arm, Buildx, GHCR; `scripts/release.sh` | F06/F08: Windows ZIP, checksum, manifest, version/tag/commit binding |
| Script không native Windows | `package.json`: clean=`rm -rf`, release=`bash ...` | F02: Node filesystem scripts + PowerShell cho quản trị Windows |
| Dữ liệu phụ thuộc working directory | `server/sqlite.ts`, `db.ts`, `media.ts`, `updater.ts`: process.cwd()/data | Một `server/config.ts`, DATA_DIR tuyệt đối, mọi store cùng dùng |
| DB mở và chạy side effects khi import | SQLite singleton, server timers tại module scope | F03: createApp/start/stop, explicit DB lifecycle, tests cô lập |
| Mỗi lần save rewrite mọi collection | `server/sqlite.ts`: DELETE + INSERT toàn bộ collections | I01: dirty-row/dirty-collection adapters từng bước, không stale snapshot đè dữ liệu mới |
| Test bỏ qua lỗi file lock Windows | `server/updater.test.ts` cleanup catch ghi chú DB còn mở | Test phải close DB/server/timers rồi xóa fixture thành công, không che lỗi cleanup |
| Health chỉ trả ok/version | `server.ts:358` | Liveness và readiness tách biệt, ready kiểm schema/DB/startup/maintenance |
| Updater có đặc quyền triển khai gián tiếp | `server/updater.ts`, deploy/updater.sh, UpdatePanel, ImmichUpdateCard | F03/F08: thay bằng thông tin phiên bản/release; triển khai do operator, không web-triggered shell |
| Telemetry chứa Linux paths | `server.ts:493–560`: /sys, /proc, statfs(cwd) | Node os/process/statfs(DATA_DIR); sensor thiếu trả null/không hỗ trợ |
| Media và session cần hardening trước mở Internet | `/uploads` static; token HMAC userId không có thời hạn trong sign/verify hiện tại | F04: media ACL, session expiry/revocation, proxy-aware login rate limits; giữ Bearer nội bộ |
| Full backup chứa cấu hình nhạy cảm | `server/fullBackup.ts` gồm app_settings.json, có thể có AI key | F07/I01: manifest, encrypted recovery backup, secrets export riêng có chủ đích, restore test |
| Test hiện hữu chưa bao phủ toàn app | Tree tại SHA khảo sát có9file test:2server (ICS/updater),7utils; không có E2E trong tree | F05/F09 bổ sung regression theo module, không coi9file test xanh là kiểm thử toàn bộ |

Đây là nhận xét tĩnh từ source, không phải báo cáo kiểm thử khai thác hoặc kết luận mọi luồng đều lỗi. [Source repo đích đã xác minh cùng baseline](https://github.com/DongVienNguyen/Family-Organizer/tree/b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91).

## 2. Ranh giới môi trường phải hiểu đúng

- **Codex Cloud:** nơi đọc/sửa code, tạo diff/PR và sửa theo CI. Không giả định shell Cloud là Windows. Official OpenAI documentation mô tả cloud environments do dịch vụ quản lý; trang legacy mô tả container/Bash. Plan không yêu cầu người dùng dựng Linux/Docker, nhưng không cam kết hạ tầng bên trong Codex Cloud là Windows. Nếu yêu cầu tuyệt đối mọi máy kể cả máy của OpenAI phải là Windows, tài liệu đã đọc chưa đủ xác nhận điều đó. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), [legacy](https://developers.openai.com/codex/cloud/environments/).
- **CI chuẩn:** GitHub-hosted `windows-2022`, `shell: pwsh`; không `ubuntu-*`, container jobs, service containers, WSL, Bash hoặc Docker action. `windows-2025` có thể thêm cho compatibility sau này, không thay runner pin bằng windows-latest.
- **Server 2019:** GitHub đã bỏ hosted image windows-2019. CI2022 đạt chỉ chứng minh CI2022. Nghiệm thu R02 phải ghi OS thật là Windows Server 2019 x64/build17763 trên VPS hoặc máy staging Windows2019 thuê riêng; không dùng PC cá nhân. [Retirement](https://github.com/actions/runner-images/issues/12045), [hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- **Production:** VPS chỉ chạy gói release, không npm install/build, compiler, Git checkout hoặc runner nhận PR. GitHub CLI `gh` là công cụ điều khiển Actions; không có sản phẩm riêng tên “Windows CLI của GitHub Actions”. Windows runner chạy Node/npm/pwsh/Playwright/gh.

## 3. Bố trí Windows và vận hành

```text
C:\Program Files\FamilyOrganizer\
  service\                 WinSW + XML, operator quản lý
  releases\<version>-<sha>\ node.exe, app\dist, app\node_modules, manifest
C:\ProgramData\FamilyOrganizer\
  config\                  server.env, proxy config, secrets (ACL hạn chế)
  data\                    family.db, uploads, app settings tương thích
  logs\                    structured logs + service logs có rotation
  backups\                 encrypted backup + manifest
  staging\                 release/restore staging, không web-servable
```

- Default DATA_DIR=`C:\ProgramData\FamilyOrganizer\data`; cho phép override đường dẫn local NTFS tuyệt đối. Cấm relative/UNC/network-share cho SQLite live; không đồng bộ file DB đang chạy bằng OneDrive/Dropbox. Cấu hình base paths có spaces/Unicode được test.
- `node.exe` chạy trực tiếp `app/dist/server.cjs` với workingdirectory cố định; service XML trỏ release cụ thể. Không cần junction/symlink hay quyền Developer Mode. Khi đổi version: dừng service, đổi đường dẫn cấu hình đã validate, khởi động lại; không đè binary đang chạy.
- App service dùng tài khoản dịch vụ riêng ít quyền; chỉ read release, modify data/logs cần thiết; không quyền sửa service/executable/certificates. Operator cài/update service có quyền quản trị. Không chạy Node bằng Administrator/LocalSystem mặc định.
- Một process Node cho một DB; không PM2 cluster, IIS web garden hay hai app instances cùng canonical state in-memory. I01 loại stale writer trước khi cân nhắc worker DB riêng. Network/AI/import parse ở ngoài write transaction, batch import giới hạn để event loop vẫn đáp ứng.
- Caddy native là service riêng, terminate TLS, chỉ proxy tới `127.0.0.1:<appPort>`; public chỉ80/443 theo nhu cầu chứng chỉ. Backend bind loopback, kiểm proxy headers, trust proxy chỉ loopback đã biết. DNS/domain/TLS được cấu hình ở giai đoạn triển khai. Có thể thay Caddy bằng IIS nếu VPS đã vận hành IIS, nhưng chỉ duy trì một lựa chọn trong bản đầu. [Caddy service docs](https://caddyserver.com/docs/running).
- WinSW stable và Caddy binary được chọn version/checksum tại F01; không download “latest” lúc cài production. Chọn WinSW runtime phù hợp Server2019, không mặc định dùng preview hoặc .NET runtime đã hết hỗ trợ. [WinSW](https://github.com/winsw/winsw).
- Graceful shutdown: stop accepting requests, ngừng scheduler, drain request có timeout, hoàn thành/rollback transaction, flush logs, close SQLite, exit. Xử lý service stop thực tế qua WinSW Ctrl+C/stop hook; không chỉ test SIGTERM giả trên hệ điều hành khác. Forced termination phải recover WAL ở lần start sau.
- Health public trả trạng thái tối thiểu; admin diagnostics chứa version, commit, schema, Node ABI, storage/backup health đã redacted. Không log token, prompt private, nội dung tài chính hoặc AI key.
- OS timezone không quyết định nghiệp vụ: lưu UTC, family timezone mặc định Asia/Saigon; test runner UTC và timezone app rõ ràng. Không cần đổi timezone toàn hệ điều hành CI.

## 4. Task nền tảng F01–F09

Thực thi từng PR nhỏ, mỗi PR có tests tương ứng. Các task này và I01 hoàn thành trước phát triển chức năng mới. Tên file mới là contract đề xuất, xác nhận path ở checkout trước sửa.

### F01 — Baseline có bằng chứng và khóa bộ công cụ

**Files:** `docs/engineering/windows-baseline.md`, `package.json`, lockfile, `.node-version`, `.github/workflows/ci.yml` (bootstrap job), `AGENTS.md`.

- [ ] Đọc HEAD/AGENTS/CLAUDE, ghi SHA, dependency/native-addon/test inventory; so với SHA khảo sát. Không tự khởi tạo CodeGraph.
- [ ] Mở PR nền tảng, thêm CI Windows nhỏ để chạy nguyên trạng `npm ci`, lint, test, build, lưu mọi failure. Baseline Node22 trước; probe Node24 riêng; không coi test chưa chạy là pass.
- [ ] Kiểm exact Node24 LTS x64 + better-sqlite3 prebuilt/ABI; nếu cần upgrade addon, làm thay đổi nhỏ kèm SQLite regression. Cập nhật @types/node cùng major, bỏ vite duplicate dependency khi phù hợp. Không dùng force-install/ignore-scripts để làm xanh giả.
- [ ] Khóa runtime patch/npm, Windows runner image, addon build/prebuilt và tool versions/checksums trong manifest. Nếu prebuilt không có, compile trên Windows builder với toolchain pin, package binary đó; production không compile.
- [ ] Ghi các lỗi baseline và owner; chỉ gate xanh khi sửa thật. Node platform table có Server2016+ x64, nhưng native-addon compatibility vẫn cần chạy thử. [Node24 BUILDING](https://github.com/nodejs/node/blob/v24.x/BUILDING.md).

### F02 — Scripts và cấu hình đường dẫn native

**Files:** `server/config.ts`, tests; `scripts/clean.mjs`, `scripts/release-notes.mjs`; package scripts; `server/{db,sqlite,media,updater,fullBackup}.ts`, `.env.example`.

- [ ] Test DATA_DIR absolute/Unicode/spaces, CWD bất kỳ (kể cả System32), startup mất write permission, import fixture cũ. `NODE_ENV` đặt bằng env workflow/service, không cú pháp VAR=value kiểu Bash.
- [ ] Thay rm/bash scripts bằng Node fs hoặc pwsh; tách codeRoot/dataRoot/logRoot/configRoot. Dùng path APIs, không nối slash/backslash thủ công.
- [ ] Migrate `./data` cũ bằng lệnh explicit có dry-run/report/backup, không tự chọn nhầm DB theo CWD. Data hiện hữu có IDs, session config, uploads, settings được giữ hoặc chuyển đổi có báo cáo.
- [ ] Kiểm production ZIP start không cần source TS/devDependencies. `npm run clean` không xóa data/release ngoài target đã kiểm tra.

### F03 — Lifecycle, telemetry và bỏ cơ chế Docker runtime

**Files:** `server.ts`, `server/app.ts`, `server/lifecycle.ts`, `server/systemMetrics.ts`, `server/updater.ts`, UpdatePanel/ImmichUpdateCard, service tests.

- [ ] Tách createApp(config,dependencies) khỏi start HTTP/jobs; expose close/dispose. Tests import không tự mở DB/network/timer ngoài fixture.
- [ ] Chuyển metrics sang os/process/statfs(DATA_DIR); CPU/SSD temperature không hỗ trợ hiển thị rõ, không 0 giả. Jobs được đăng ký/dừng từ registry I01.
- [ ] Docker updater/app auto-apply/Immich manage bị gỡ khỏi routes/jobs/UI Windows. Giữ external service links nếu người dùng cấu hình; không tự quản lý Immich/Docker.
- [ ] Version UI chỉ báo release/current build, operator dùng release workflow và script Windows; app không nhận target path/shell từ request để thực thi.
- [ ] Test liveness/readiness/maintenance, request drain, stop/restart/crash, file lock release. Readiness false khi migration đang chạy hoặc thiếu quyền dữ liệu.

### F04 — Bảo vệ dữ liệu trước Internet và AI

**Files:** auth middleware tách khỏi server.ts, `server/auth.test.ts`, media routes/tests, `server/media.ts`, frontend session handling.

- [ ] Giữ Bearer đăng nhập nội bộ nhưng thêm expiry, server-side revocation/token version, logout/password change invalidation, key rotation. Định nghĩa chuyển token cũ bằng một lần đăng nhập lại; không thêm scoped integration tokens.
- [ ] Route tests đầy đủ roles/object ACL; bảo vệ media bằng metadata owner/domain reference. Migrate URL cũ, markdown/receipts/proofs; blob fetch hoặc cơ chế same-origin có auth, không access token dài hạn trong URL/cache.
- [ ] Login rate-limit kiểm spoofed forwarded headers; giới hạn body/upload, MIME/content checks, SVG active content được sanitize hoặc reject; streaming import size/count limit.
- [ ] Server filters trước count/pagination/search/AI context/export; bảo vệ existing health/documents/private notes cùng task/finance. E2E child không truy xuất finance kể cả URL trực tiếp.
- [ ] Test PWA logout/user-switch xóa private cache/IndexedDB; authenticated API/media `no-store` phù hợp, không cache dữ liệu người khác qua service worker. Backup/log redaction test.

### F05 — CI Windows hoàn chỉnh và bằng chứng máy đọc được

**Files:** `.github/workflows/ci.yml`, `scripts/ci/*.ps1`, `vitest.config.*`, `playwright.config.*`, `tests/{integration,e2e,windows}`, coverage config.

- [ ] PR/push main/merge_group nếu dùng merge queue; cùng `windows-2022`, pwsh, permissions contents:read, concurrency cancel outdated PR. Không path-filter khiến required check biến mất.
- [ ] Job quality: `npm ci` → typecheck/lint → unit/integration → build. Npm lockfile cache đúng OS/Node/lock, không copy node_modules từ Cloud.
- [ ] Browser job chạy production build + synthetic DB/port riêng + wait-ready + Playwright Chromium; Chromium/Firefox/WebKit trong full regression khi runner hỗ trợ, ghi giới hạn browser engine rõ. Tắt external deliveries, AI bằng fixtures.
- [ ] Unit/integration JUnit, coverage LCOV, E2E HTML/trace/video lỗi, service logs, package manifest được upload bằng `if: always()`; thiếu report cũng làm gate fail. Synthetic artifacts có retention giới hạn.
- [ ] CI script pwsh đặt `$ErrorActionPreference='Stop'`, bật StrictMode, kiểm `$LASTEXITCODE` sau native process. ErrorActionPreference một mình không chứng minh npm đã exit0. Timeout test/server, finally cleanup process/service/DB.
- [ ] Không retry để che flaky: ghi retry count, critical flows phải pass lần đầu; rerun sau thay đổi chỉ chấp nhận với giải thích. Không giảm assertion/skip hay coverage threshold để xanh.
- [ ] Coverage baseline đo rồi đặt ratchet; code mới domain ưu tiên branch coverage, từng acceptance invariant phải có test. Không tuyên bố mọi tình huống đã được chứng minh vì coverage100%.
- [ ] `ci-gate` luôn chạy, kiểm kết quả tất cả job bắt buộc success; skipped/cancelled/missing = fail. Đặt làm required status check; workflow/job names ổn định.

**Ma trận regression cho chức năng cũ, bắt buộc trước F09:**

| Module hiện có | Integration/contract tests | E2E smoke với synthetic data |
|---|---|---|
| Auth/users/settings | password/session expiry/revoke, role changes, admin last-user guard | login/logout/user-switch, cấu hình được phép |
| Tasks/rewards | submit/approve/reject/reopen/recurrence/rotation, reward once | adult giao→child báo→adult duyệt |
| Finance/assets/debts/goals | amount/date/filter/schedule và tổng số liệu cũ giữ nguyên trước migrationV2 | tạo/sửa/xóa fixture, dashboard khớp |
| Schedules/ICS | recurrence/timezone/share/filter, malformed import | lịch và ICS đọc được đúng người |
| Notes/documents/media | private/shared ACL, upload/delete/reference cleanup | markdown/attachment mở được, user khác bị chặn |
| Shopping/meal planning | list items, purchased/history, dish/meal plan persistence | danh sách mua sắm và kế hoạch bữa ăn |
| Medication/child health | dose/log/reminders, vaccinations/growth/BMI, role visibility | cập nhật nhật ký synthetic, không lộ hồ sơ riêng |
| Search/dashboard/notifications | actor ACL trước totals/results/recipients, send adapters mocked | search/drilldown/read notification |
| Assistant hiện tại | provider request mocked, unavailable/timeout/permission handling | error/loading/cancel state; không live key |
| Backup/system/PWA | consistent snapshot/restore, service lifecycle, secret redaction | restore trên dữ liệu giả, logout clear cache, reload sau release |

Đây là tối thiểu bảo vệ regression, không cam kết vét cạn mọi tổ hợp. F01 phải map từng route/feature còn lại vào owner và test; module bị tắt vẫn cần test flag-off. Không bỏ chức năng không phải Wallet/Tasks chỉ vì plan nâng cấp tập trung hai module đó.

### F06 — Gói release Windows có thể chạy độc lập

**Files:** `scripts/windows/{Build-Package,Test-Package}.ps1`, `release-manifest.schema.json`, dependency/runtime manifest, `tests/windows/package.*`.

- [ ] Tạo ZIP win-x64 từ commit đã biết, đóng gói dist, production node_modules (kể cả better_sqlite3.node), exact node.exe, launch/service templates, scripts, licenses, build metadata. Dependency frontend-only chuyển devDependencies có kiểm build/runtime, không làm mù quáng.
- [ ] Kiểm runtime tải từ nguồn chính thức + checksum đã pin; ghi Node version/ABI, native addon version, app SHA/schema min-max vào manifest, SHA256 từng release asset. Không đóng .env/data/test fixtures/secrets/devtools.
- [ ] Giải nén ở runner/job sạch khác build job, thư mục có spaces/Unicode, clear project PATH influence; chạy **node.exe trong ZIP**, không global Node. Test dependency resolution không dựa checkout/node_modules ngoài ZIP.
- [ ] Synthetic install → CRUD/task/reward/finance cơ bản → restart giữ data → migration fixture → backup/restore → reject incompatible schema. Quét ZIP path traversal, symlink/reparse, ADS/drive path trước extract installer.
- [ ] Artifact của package test là đúng artifact được promote; nếu build lại khác SHA256 phải test lại. Compress-Archive có giới hạn; chọn zipper streaming tương thích kích thước dự kiến và kiểm file list/hash sau unzip.

### F07 — Service, sao lưu và rollback Windows

**Files:** `deploy/windows/*.xml`, `scripts/windows/{Install-Service,Uninstall-Service,Backup,Restore,Update,Rollback,Test-Service}.ps1`, `server/appSnapshot.ts` từ I01.

- [ ] WinSW start/stop/restart/recovery trên disposable hosted Windows VM; cấu hình account/ACL, stdout rotation, boot start. Kiểm file lock closed, cleanup service sau test. Reboot thực tế để R02.
- [ ] Install/update scripts idempotent, có ValidateOnly/WhatIf, kiểm resolved target trước move/delete, không xóa whole ProgramData. Cài lại không seed/overwrite existing DB hay secrets.
- [ ] Backup online qua SQLite API giữ WAL; phối hợp write barrier/immutable media manifest với uploads, settings, module tables. F07 sở hữu Windows file/ACL/orchestration; I01 sở hữu DB consistency/manifest, không tạo engine backup thứ hai.
- [ ] Recovery backup chứa secrets phải encrypted authenticated, key ngoài backup và có bản recovery lưu an toàn; DPAPI-only không đủ chuyển sang máy khác. Backup thường loại credentials, restore yêu cầu nhập lại. Không gửi plain settings/key lên Actions artifacts.
- [ ] Restore vào staging, validate hashes/schema/constraints/row totals/media, stop workers + close DB trước swap; không copy family.db live rồi bỏ WAL. Retry fail giữ cả snapshot lẫn nguồn, no replay points/payments/old push.
- [ ] Version schema không tự reset về1 khi startup; migration có checksum/order/transaction và lock. Tách expand/backfill/contract để code phiên bản trước còn đọc được trong cửa sổ rollback khi khả thi; downgrade ngoài manifest bị chặn. Sau restore bảo mật phải revoke sessions cũ theo policy đã ghi, không vô tình khôi phục quyền truy cập đã thu hồi.
- [ ] Update giữ maintenance/write fence cho tới health+smoke đạt. Nếu migration không backward-compatible, rollback binary đơn thuần bị chặn. Restore snapshot trước update chỉ tự động khi chưa nhận writes mới; nếu đã mở write, cần recovery/delta reconciliation và quyết định operator, không silent mất dữ liệu.
- [ ] Lịch backup chạy bằng Task Scheduler pwsh + service account hoặc job nội bộ I01; chỉ một owner. Kiểm exit codes, backup age/disk-full/retention, một bản off-host encrypted. Mục tiêu RPO24h/RTO60m ban đầu phải đo trong R02.

### F08 — CI/CD tách release khỏi production

**Files:** `.github/workflows/{ci,release-candidate,promote-release}.yml`, `scripts/windows/Test-ReleaseEvidence.ps1`, docs runbook.

- [ ] PR CI không secrets production, không deploy. Actions pin commit SHA, least permissions. Không checkout untrusted PR bằng pull_request_target với write token. Self-hosted runner không nhận PR public. [GitHub security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
- [ ] workflow_dispatch trên trusted main tạo candidate theo explicit commit/version: verify ancestry/main, version/tag match, CI success đúng SHA → package/test → draft/prerelease asset immutable + evidence. Không dùng “latest successful run” không kiểm SHA/workflow identity.
- [ ] GITHUB_TOKEN chỉ có quyền write release ở publish job; các build/test jobs read-only. Trigger bằng GitHub integration/PAT được phép nếu cần; push do GITHUB_TOKEN có thể không kích workflow kế tiếp, phải dùng dispatch/reusable workflow rõ ràng, không giả định chain tự chạy.
- [ ] Promote sau R02: asset hash giữ nguyên, evidence ghi Windows2019/build/runtime/appSHA/hash, approval environment nếu plan GitHub hỗ trợ. Nếu không có protected environment, dùng operator-controlled manual release gate; không nói policy đã được enforce khi chưa cấu hình.
- [ ] Không tự deploy production chỉ vì push/main hoặc tag. Production credentials không vào Codex Cloud; deployment script/operator chỉ đọc release đã approve. Gỡ Docker workflows/docs khỏi đường vận hành chính, giữ lịch sử ở Git.

### F09 — Chốt nền tảng rồi mới phát triển tính năng

**Files:** `docs/engineering/foundation-acceptance.md`, machine-readable `test-evidence.json`, Windows operations draft.

- [ ] CI Windows quality/browser/package/service/migration/restore đều xanh cùng SHA, không skipped required suite; mọi tính năng cũ có smoke/regression owner, tài liệu mapping tests rõ.
- [ ] Synthetic backup restore giữ user/task/points/finance/media/settings, source legacy không bị overwrite mất dữ liệu. Khóa merge nếu suite critical lỗi.
- [ ] Xác minh repository scripts/runtime không phụ thuộc Docker/Linux/WSL/GHCR; frontend phiên bản Windows không nút auto-update Docker/Immich. Tests Windows native ghi rõ runner OS.
- [ ] Chốt Node/addon/WinSW/Caddy compatibility manifest, failures đã sửa hoặc blocker cụ thể. Chưa claim Server2019 nghiệm thu nếu chưa R02; mốc này là **nền tảng CI Windows đạt**.

## 5. Cổng triển khai R01–R03

### R01 — Đóng băng release candidate

**Files:** release workflow/evidence, `docs/releases/<version>.md`.

- [ ] I03 + full feature regression, typecheck/build, package/service, performance/migration/restore pass đúng commit. Dependency scan/license review có policy và xử lý finding; không thay lockfile phút cuối mà không rerun.
- [ ] Tạo candidate ZIP/checksum/manifest, staging config, backup/migration/rollback report, checklist features enabled. Không đưa candidate tự động lên VPS production.

### R02 — Nghiệm thu Windows Server 2019

**Files:** `scripts/windows/Accept-Server2019.ps1`, `tests/windows/acceptance`, signed-off report artifact (không cần code signing để gọi đây là báo cáo review).

- [ ] Ưu tiên VPS/VM Windows2019 staging dùng một lần. Nếu chỉ có một VPS trống, chạy acceptance synthetic trước cutover; nếu VPS đang có production, dùng instance/port/data/service riêng và maintenance được sắp xếp. Không chạy tests phá dữ liệu trên DB thật.
- [ ] Ghi OS caption/build17763/x64, patches, runtime/addon versions, ZIP SHA256; verify downloaded asset. Kiểm prerequisite từ manifest, không cài compiler/npm trên production.
- [ ] Chạy cold-install/boot after reboot/stop-start/crash recovery/TLS/reverse proxy/auth/PWA/media; restore copy synthetic/sanitized, migrate-repeat/rollback/low disk/permission denied/file lock/timezone boundary.
- [ ] Full unit/integration/E2E có thể chạy trên **Windows2019 staging** qua runner riêng hoặc test bundle riêng nếu muốn mở rộng fidelity; production chỉ release acceptance/smoke. Test harness nằm ngoài runtime ZIP, không biến VPS production thành dev box. Playwright hiện liệt kê Server2019+, vẫn pin browser/driver và xác minh bản dùng thực tế. [Requirements](https://playwright.dev/docs/intro).
- [ ] Automation tùy chọn: self-hosted runner trên staging2019 riêng, chỉ workflow trusted dispatch và synthetic data; tuyệt đối không runner PR trên production. Không có staging thì ghi limitation, nghiệm thu bằng script trên VPS, không giả lập kết quả bằng runner2022.
- [ ] Đo tải đại diện theo cấu hình VPS thực; ghi p50/p95/RSS/event-loop lag/DB size, SLA dự kiến là mục tiêu chứ chưa phải benchmark. Dry-run restore đo RPO/RTO. Fail bất kỳ mục mandatory → sửa trên Cloud, CI lại, candidate mới.

### R03 — Cài production và theo dõi

**Files:** runbook deployment/change record, `Accept-Production.ps1`, backup-monitor configuration.

- [ ] Operator approve version/hash đã R02 đạt. Snapshot trước cutover, write fence, stop service, cài release, migrate, start, readiness/smoke trước mở write. Không rebuild trên VPS.
- [ ] Kiểm user/admin thật bằng thao tác nghiệm thu hạn chế, số dư/điểm/IDs và media sau migration khớp report; bật module theo rollout, monitor24–48h + một chu kỳ backup/restore rehearsal.
- [ ] Phát hành kèm evidence, rollback guard và hướng dẫn backup. Thu hồi credential staging; retention cho releases cũ có giới hạn nhưng giữ version cần recovery.
- [ ] Ghi kế hoạch nâng OS trước hạn hỗ trợ Server2019; Microsoft nêu extended support kết thúc09/01/2029. [Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2019).

## 6. Tối ưu hiệu quả phát triển và AI

- Giữ module hiện có, không rewrite toàn app hoặc đổi database vì muốn “tốt nhất”. I01 chuyển write gateway/dirty writes trước; P02/W02 thêm relational tables theo domain. Query index, pagination/keyset, batch size, query plans được đo trước khi thêm cache hay DB server khác.
- UI lazy-load Matrix/Kanban/finance/AI theo route, virtualize danh sách lớn; aggregate/filter ở server cùng ACL, query-key có actor/view-revision. Mutation optimistic phải rollback khi409; invalidation dùng domain events, không refetch mọi module sau mỗi drag.
- Matrix urgency recompute theo mốc ngày/timezone+dataset revision, không update mọi task mỗi phút. Kanban rank chỉ rebalance phạm vi cần thiết. Những invariants P/W/I đã chốt vẫn là nguồn nghiệp vụ.
- Tách PR hạ tầng, migration, domain, UI; một PR có một kết quả kiểm chứng. PR thay schema phải có upgrade/retry/rollback fixture; UI chỉ style dùng interaction/visual checks phù hợp, không thêm test chỉ lặp implementation.
- AI ở P17/W16: adapter phía server cho provider đã cấu hình, secret không ra browser, timeout/cancel/rate+cost budget, schema validation, redacted logging. Fixtures offline deterministic bắt buộc; live provider contract test dispatch riêng với key test, không bắt PR cần Internet/key.
- AI chỉ nhận context actor được phép, trả draft kế hoạch/task/categorization. Thực thi sau user confirmation qua semantic commands có ACL/revision/idempotency. AI không approve reward, tự post expense, chạy shell/service hay vượt permission bằng prompt.
- Evals versioned: Vietnamese dates/ambiguity, invalid JSON, adversarial task content, private account leakage, duplicate submissions, provider timeout. Chất lượng AI có ngưỡng rubric và cost/latency; không dùng AI để tự đánh giá mọi output là đúng.

## 7. Thứ tự và ước lượng

F01 bootstrap CI → F02/F03 → I01 → F04/F05 → F06/F07 → F08/F09; các test bổ sung ngay trong task tương ứng. Tiếp theo chạy P/W/I theo master, cuối cùng R01/R02/R03. F07 và I01 chia ownership như trên, không tính hai lần engine backup.

Ước lượng39task cũ107–185 ngày công là lịch sử phạm vi tính năng, **không còn tổng dự án Windows**. Chưa có baseline runtime/toolchain/VPS để đưa deadline có căn cứ. Sau F01 lập estimate từng task, dependency/critical path, effort còn lại, trừ overlap I01/F07/I03/R; sau F09 dùng throughput PR/CI thực để cập nhật. Không dùng số ngày ước lượng để chứng minh hoàn tất.

Điều kiện kết thúc phiên plan: tài liệu và prompts nhất quán, có cổng Windows2019, không yêu cầu PC chạy. Điều kiện kết thúc triển khai: CI links + exact SHA + artifacts + report R02/R03 thực, không phải lời báo “all tests pass” thiếu bằng chứng.
