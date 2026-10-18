# Family-Organizer PC Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task if that skill is available. Steps use checkbox syntax. This document is a handoff for PC execution, not a request to continue Cloud implementation now.

**Goal:** Tiếp tục các tính năng chính trên PC Windows từ snapshot source gọn, bảo toàn bản đầy đủ trên Cloud và nghiệm thu tổng hợp ở cuối nhóm.

**Architecture:** Giữ React/Express/SQLite, một gateway I01 và các domain canonical hiện có. Snapshot PC chỉ lọc file phân phối; không xóa tests hoặc bằng chứng khỏi repo đầy đủ. Đưa diff source chọn lọc về nhánh đầy đủ trước final regression/merge.

**Tech Stack:** Windows x64, PowerShell 7, Node24.21.0/npm11.19.0, better-sqlite3 13.0.3, TypeScript/React/Vite/Express.

**Spec:** Yêu cầu bàn giao PC ngày 2026-10-18; [master](2026-10-11-family-organizer-upgrade-master.md), [Windows foundation](2026-10-11-windows-native-foundation.md), [Productivity](2026-10-11-productivity-family-organizer.md), [Wallet](2026-10-11-wallet-family-organizer.md). Yêu cầu PC mới thay thế quy trình Cloud-only cũ; các ràng buộc dữ liệu và chất lượng vẫn áp dụng.

## Global Constraints

- Không rewrite app, public REST API/integration tokens/MCP/bank sync hoặc runtime Docker/Linux/WSL/GHCR.
- Chỉ dữ liệu synthetic và offline adapters; không production secrets, thông báo hay AI provider thật.
- PowerShell kiểm `$LASTEXITCODE` ngay sau từng npm/native; không dựa riêng ErrorActionPreference.
- Giữ Money chính xác theo currency; nonce/revision/I01 atomic; current ACL cho cả nguồn, media, SSE và caches.
- Không skip assertions, hạ tiêu chuẩn, tăng timeout/retry hoặc continue-on-error để xanh CI.
- Không yêu cầu PC làm GitHub runner; không tải nguyên test corpus/browser binaries về PC.
- Final qualification: Windows2022 x64/pwsh Node22 baseline và Node24. Windows PC/2022 không thay thế Server2019 R02.
- Không release/tag, truy cập hoặc deploy VPS. Chuyển máy phát triển không cấp quyền các bước này.

## Review Focus

1. Cùng tài sản xuất hiện trong legacy Asset và Portfolio: chỉ tính một lần; thiếu giá phải chỉ rõ coverage, không thay bằng 0.
2. Mất quyền sau khi đã mở màn hình/nhận cache: labels, counts, media và SSE phải ẩn ngay; link không cấp quyền.
3. Cancel, lost ACK và retry/conflict: không ghi thêm tiền, points, claims hoặc liên kết trùng.
4. Restore/cold start với nhiều schema: giữ refs/history và không replay thông báo/reward; lỗi không sửa DB.
5. Legacy migration/rollback sau phát sinh mới: bảo toàn event delta; unsupported mapping phải được nêu rõ, không mất dữ liệu.

## Trạng thái xuất phát

Đọc SHA chính xác trong `SOURCE-MANIFEST.json`; không suy HEAD từ tên nhánh.

| Phạm vi | Tình trạng tại bàn giao |
| --- | --- |
| F01–F09/I01, Matrix/Kanban/Wallet core | Đã có nền/source và bằng chứng lịch sử; xem foundation/status, không làm lại từ đầu |
| P11–P17, I02 payment/overview/Calendar/search | Có các Cloud functional slices; chưa toàn bộ nghiệm thu master |
| Full Cloud suite gần nhất | Source `29f7b30a8f61ec739938e63a922a5a882055ca23`: 9052 tests/598 files; proof commit `0d335a4f80bd0238e16451bd45ad57c942c5f107` |
| Browser I02 | Family8 tại `9e7c49b`, Calendar4 tại `29f7b30`, cùng production/build `99bc01d`; không nói tất cả chạy cùng SHA |
| W15 mới trong snapshot | **WIP**: Wallet17 Asset links/schema/snapshot + Money net worth pure function + bước đầu legacy/media/ACL; chưa API/UI/unified native query và chưa browser/full suite/Windows mới |
| Windows cuối được nghiệm thu | PR136, source `7e59abd0c682acf4dba80a7830e54c7e2e052a33`, run [38987528125](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38987528125); không áp dụng cho source mới |
| Toàn bộ master/R02/R03 | **Chưa hoàn thành**; không nghiệm thu Server2019, release hay VPS |

## PC01 — Lấy source và xác minh khởi chạy

**Files:** `START-HERE-PC.md`, `SOURCE-MANIFEST.json`, `package*.json`, `server/operator.ts`, `server/config.ts`; ghi `docs/handoff/pc-progress.md`.

**Interfaces:** compiled `dist/operator.cjs` nhận stdin `{username, fullName, password}` trên installation production mới; `dist/server.cjs` dùng external DATA/CONFIG/LOG, HTTP loopback.

- [ ] Giải nén vào thư mục mới; kiểm manifest, source SHA và Node24.21.0 x64/npm11.19.0.
- [ ] Lưu checkpoint Git local trước sửa; đây là source snapshot không có Git history, không kết nối push main tự động.
- [ ] Chạy từng lệnh `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd run build` theo START-HERE, kiểm exit. Không cài browser, không omit devDependencies.
- [ ] Khởi tạo admin tương tác một lần với external storage mới, chạy app, login/logout và restart; dữ liệu tự tạo phải còn nguyên. Không dùng default admin/password hoặc xóa database để vượt refusal.
- [ ] Ghi OS/runtime/các lệnh và kết quả thực tế. Kiểm schema/flags đang có; tính năng pilot không tự bật trên installation mới. Dùng migration API hiện hữu và backup synthetic đã xác minh nếu cần opt-in; không sửa số version/default để hiện UI.

**Done:** App chạy được trên PC, checkpoint/giới hạn rõ; chưa tuyên bố regression pass từ build.

## PC02 — Hoàn thiện W15 Asset–Portfolio và net worth

**Files:** `server/wallet/{assetLinks,assetLinkSchema,ports,integration,schemaRegistry,snapshot,investments}.ts`, `server/{app,sqlite,media,mediaPolicy}.ts`, `src/features/wallet/{netWorth,Portfolio}.tsx/ts` theo file thực tế, Wallet SDK/Finance/Assets component tìm qua `rg`.

**Interfaces:** giữ `createWalletAssetLinks({reader,write,now?}).bind(ctx,input)`/`.archive(ctx,id)`/`.canRead(actor,id)`, `canReadBoundAsset(reader,actor,id)`, `calculateNetWorth(raw:NetWorthInput)` hiện có. Native query chỉ truyền facts đã được actor hiện tại phép đọc; không lấy tổng từ legacy JSON làm nguồn chuẩn.

- [ ] Đọc W15 WIP và các test tương ứng trên nhánh đầy đủ qua GitHub khi cần, không tải toàn corpus. Hiện bind/archive chưa mounted route/UI; pure net worth chưa có native adapter.
- [ ] Hoàn thiện API nội bộ/SDK/UI bind-unlink có nonce+revision, current manage-account ACL và stock/currency/held-position checks. Unlink sau mất account ACL trả receipt sanitized, không private source facts.
- [ ] Kiểm từng tình huống bằng dữ liệu synthetic hoặc case tập trung mới: asset `stock` liên kết đúng account/instrument; bind hai lần/retry không thêm dòng; account revoke che Asset GET/media/SSE; thêm/sửa Asset khác không cascade link; đổi type/currency của Asset đang bind phải atomic409.
- [ ] Thêm native query và UI net worth theo currency: account cash + position market value + manual assets chưa bind + lent receivable − borrowed principal; không cộng Goal earmark, không double-count bound Asset, không implicit FX/Number money. Thiếu quote/estimate hiển thị subtotal+coverage và total chưa đầy đủ.
- [ ] Kiểm missing/stale quote, zero/nonzero holdings, multiple currencies, duplicate binding, rollback khi history lỗi, snapshot mixed schemas/cold startup. Giữ frozen migrations/default activation/packagecaps; đừng chỉ đổi cap để bật tính năng.
- [ ] Lint/build + thao tác Accounts→trade→Portfolio→bind Asset→net worth→revoke/unlink. Ghi 390px/light/dark nếu UI đổi; lưu diff source, không claim full suite/Windows.

**Done:** End-to-end W15 chính dùng được, số tiền và quyền không sai; regression đầy đủ còn chạy trên nhánh đầy đủ trước tích hợp.

## PC03 — W18 một canonical finance writer và rollout an toàn

**Files:** `server/wallet/{legacy,migrationService,migrate,records,links}.ts`, `server/app.ts`, `server/db.ts`, `src/components/Finance.tsx`, Wallet SDK; tạo/cập nhật `docs/wallet/{operations,parity}.md`.

**Interfaces:** reuse `createWalletLegacyMigration(...).migrate(context,{timezone})`, I01 safety snapshot validation/readback, `createLegacyFinanceReader`/`projectLegacyRecord` hiện có. Đọc signature thực tế trước sửa. Không tạo second ledger/writer hoặc cơ chế backup riêng.

- [ ] Lập bảng legacy finance GET/POST/DELETE hiện hữu → native command/projection và loại không representable. Pure projection tồn tại nhưng chưa được lắp vào runtime; UI legacy và Wallet còn song song.
- [ ] Viết case nhỏ/hướng dẫn thực nghiệm với VND income/expense representable; USD/transfer/trade/unsafe-number phải explicit unsupported/coverage, không chuyển ngầm hoặc làm tròn mất tiền.
- [ ] Lắp read adapter và command routing theo rollout disabled/pilot/enabled với một writer trong I01, nonce/revision/current ACL. Legacy→new và new→legacy không tạo khoản trùng; giữ hành vi/UI cũ cần thiết.
- [ ] Pilot trên bản sao synthetic: durable validated snapshot trước migrate; nguồn đổi trong lúc backup phải abort. So account/currency/period/opening balance; mapping/quarantine/differences được giải thích, không lấy old incompletely linked Goal/debt tổng làm chuẩn net worth.
- [ ] Thử lost ACK, cancel, hai client conflict và writer failure. Thử rollback sau post-cutover transfer/trade: giữ snapshot mới/event delta, không silent downgrade; restore V2 không mất writes.
- [ ] Ghi parity completed/partial/excluded theo GAP G01–G12, giữ bank/token/MCP excluded. Lint/build và hành trình finance thực tế; checkpoint diff chọn lọc.

**Done:** Có một nguồn finance canonical và đường pilot/rollback bảo toàn dữ liệu; không chỉ thêm bảng/UI mà để hai writer hoạt động độc lập.

## PC04 — Hoàn thiện I02 và các gap M1 quan trọng

**Files:** `server/{domainLinks,domainLinksRouter,familyOverview}.ts`, `server/productivity/{domainLinkRecord,domainLinkSchema}.ts`, `src/features/shared/{domainLinks,familyOverview,familyOverviewWorkspace}.ts`, Productivity session/drawer, `src/components/{Tasks,Dashboard,GlobalSearch}.tsx`, `docs/engineering/{m1-feature-checklist,wallet-feature-checklist,family-domain-links}.md`.

**Interfaces:** typed source refs hiện tại và existing atomic payment command; source links không là permission grants. List/Matrix/Kanban/Calendar cùng Task ID và workflow canonical.

- [ ] Đối chiếu checklist với source; giữ những Cloud slices đã chạy, chỉ xử lý gap thực tế. Thêm quản lý create/archive link và điều hướng các ref-kind còn thiếu, không rewrite payment/overview/search đã có.
- [ ] Thao tác một synthetic Task qua List→Matrix→Kanban→Calendar→drawer; deadline/WIP/move cancel, Section Done không tự completed, Child→Review→adult approval đúng một reward event.
- [ ] Thử Task payment preview/cancel không posting, confirm một lần, lost-ACK retry giữ nonce/draft. Thử cả hai nguồn private/unshare và response cũ tới sau đổi session; labels/counts/media phải không lộ.
- [ ] Kiểm recurrence/rotation, Focus/Habits/reminders/Insights/preferences chính; restore không tự gửi hay cộng điểm/tiền lại. Tính năng optional (AI capture/offline writes/live market corporate actions) ghi partial/excluded theo scope, không tự hứa đã xong.
- [ ] Lint/build khi có source đổi, ghi các hành trình và task còn thiếu; checkpoint một nhóm nhỏ.

**Done:** Luồng chính usable và checklist trung thực, trước capacity/system qualification.

## PC05 — Chuẩn bị P18/W17/W18/M1/I03 tổng hợp

**Files:** `server/{appSnapshot,snapshotValidation,appStore,sqlite}.ts`, Task native query/provider, `scripts/benchmark-wallet.ts`, benchmark Productivity và docs parity/performance. Full tests/workflows sửa trên nhánh đầy đủ khi quay lại đó.

- [ ] Profile trước sửa: AppStore có thể đọc/serialize legacy collection mỗi write; Task provider có thể load cả collection. Đo SQL/query plan/RSS/time, không đổi database/framework theo phỏng đoán.
- [ ] Dataset synthetic Task10k active+100k historical, Wallet100k. Snapshot hiện có giới hạn100k ordinary rows/256MiB; mixed dataset không vừa. Thiết kế bounded transport/restore và đo trước thay cap, không gán authoritative rows thành derived để lách quota.
- [ ] Mục tiêu reference Windows: page50 p95<500ms, Matrix<1s, move p95<500ms; Wallet monthly report<1s/import10k responsive. Ghi máy/Node/data/sample sizes; đây là targets, không phải kết quả đã đo. Không lặp lại tối ưu import đã sửa ở `7cae94a` nếu không có regression mới.
- [ ] Chuyển diff source/docs PC sang nhánh đầy đủ dựa trên manifest SHA. Review file chọn lọc; giữ tests, evidence và CI có sẵn; không merge source-only tree. Bổ sung regression cho behavior đổi ở đó.
- [ ] Chạy một composed full unit/integration suite và browser hành trình affected, lưu JUnit/JSON/số tests/exits/exactSHA. Không chạy aggregate nặng đồng thời browser trên cùng máy ít CPU rồi tăng timeout.
- [ ] Recovery với mixed schema và capacity: money/Task/media/ACL/prefs/schedules/portfolio giữ đúng; WAL writer + backup/restore, cold restart và invalid-snapshot-no-change/no replay. Thực nghiệm pilot rollback có writes mới; checklist UI/DOC/NEW/GAP/excluded.

**Done:** Feature group có regression/performance/recovery/pilot bằng chứng đầy đủ, lỗi còn lại cụ thể; không suy toàn bộ pass từ một build.

## PC06 — Nghiệm thu Windows cuối nhóm, không lặp mỗi commit nhỏ

**Files:** `.github/workflows/ci.yml`, `scripts/ci`, existing Windows package/service harnesses **chỉ trên nhánh đầy đủ**.

- [ ] Tối ưu setup browser fixture nếu profiling chứng minh bottleneck: tránh chuỗi13→24 TSX process/fixture; giữ isolated fixtures/13 harnesses, engines, assertions, deadlines, native max-version checks. Không bỏ browser/harness vì chạy lâu.
- [ ] Đăng ký 13 feature browser harnesses mới vào required qualification hiện hữu; chạy windows-2022/pwsh Node22+24, lint/unit/build, Chromium/Firefox/WebKit/touch, applicable package/service/native and performance checks tại final HEAD.
- [ ] Đọc log/artifact đúng SHA; sửa nguyên nhân lỗi rồi kiểm lại scope liên quan. Giữ ci-gate/PR/up-to-date/no-bypass; review trước merge. Không chứng nhận build là tests pass.
- [ ] Cập nhật status SHA/PR/runURL/checks/counts/failures/not-run/next. R01 release candidate/R02 Server2019/R03 VPS vẫn là các gate riêng cần quyền/bằng chứng sau này; không phát hành, tag hay truy cập VPS trong plan bàn giao này.

**Done:** Feature group được nghiệm thu Windows đúng HEAD và review; toàn bộ master chỉ hoàn tất khi từng yêu cầu thực sự được đáp ứng. R02/R03 không được coi hoàn tất qua Windows PC/CI.
