# Family-Organizer — Plan cuối cùng: Windows-native, Codex Cloud và Windows CI

**Repo đích duy nhất:** [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), public, default branch `main`. Đã xác minh HEAD là `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`, trùng baseline khảo sát. Mọi Cloud environment, branch/PR, GitHub Actions, ruleset, release và artifact của plan phải thuộc repo này. Kiểm tra lại HEAD trước thực thi; không tạo PR/release ở repo nguồn trước đây.

> **For agentic workers:** Đây là **entry point cuối cùng**, cập nhật11/10/2026 theo mô hình ba giai đoạn của người dùng. Thực thi trong Codex Cloud bằng PR nhỏ, kiểm thử GitHub Actions Windows, nghiệm thu Windows Server2019 trước production. Đọc AGENTS và plan liên kết; kỹ năng Superpowers chỉ áp dụng khi có trong môi trường thực thi, không giả định plugins trên PC được đưa vào Cloud.

**Goal:** Chuyển Family-Organizer sang Windows-native trước, dựng CI đạt cho nền hiện có, rồi nâng cấp Eisenhower Matrix/Kanban, công việc/lịch/AI và tài chính trong phạm vi đã chọn. Code trên Codex Cloud, test trên GitHub-hosted Windows, cài release đã nghiệm thu lên VPS Windows Server2019; không cần PC cá nhân chạy build/test.

**Architecture:** Modular frontend/backend trong repo hiện có, một auth/SQLite/gateway ghi/snapshot và scheduler chung. Task có nhiều projections; Wallet có ledger nguyên tử; các module nối bằng typed links có ACL, không tự động biến hoàn thành công việc thành chi tiêu hoặc biến timer thành điểm thưởng.

**Tech Stack:** React19/TypeScript5.8/Vite6/Tailwind4/Motion/Lucide/i18next; Express4/SQLite/Vitest/pdfmake/PWA giữ theo repo. Node24 LTS x64 và better-sqlite3 tương thích được xác minh/pin ở F01; Windows Service qua WinSW, Caddy native HTTPS, PowerShell7, ZIP win-x64. Không Docker/Linux/WSL/GHCR trong runtime hoặc pipeline kiểm thử/phát hành của app. Không đổi Next.js/PostgreSQL hay tạo microservices.

**Specs và plan chi tiết:**

| Module | Đặc tả/bằng chứng | Plan thực thi |
|---|---|---|
| Nền tảng, CI, package, Windows service | Source review và contracts trong plan Windows | [F01–F09, R01–R03](2026-10-11-windows-native-foundation.md) |
| Quy trình Cloud và prompts copy dùng ngay | Setup, command/evidence contracts | [Hướng dẫn + prompts](2026-10-11-codex-cloud-windows-guide-and-prompts.md) |
| Productivity | [TickTick research/design](../specs/2026-10-11-ticktick-productivity-design.md) | [P01–P18](2026-10-11-productivity-family-organizer.md) |
| Tài chính | [Wallet research/design](../specs/2026-10-11-wallet-research-and-design.md) | [W01–W18](2026-10-11-wallet-family-organizer.md) |
| Phần dùng chung/tích hợp | Sections 3–5 tài liệu này | I01–I03 bên dưới |

W01 tương ứng Task1 của Wallet, P01 tương ứng Task P01 của productivity; không dùng số task trần giữa hai module. Tổng **51 mã task**: 9F +18W +18P +3I +3R. Đây là work breakdown, không phải51PR bắt buộc. I01 ở giai đoạn nền; I03 tổng hợp kiểm chứng tính năng trước R01, không làm lại các task F/R. Master quyết định thứ tự/phạm vi, plan Windows quyết định môi trường/CI/release; plan P/W quyết định nghiệp vụ. Mọi chỉ dẫn Docker/Pi trong lịch sử nguồn chỉ là hiện trạng cũ. Nếu HEAD thay đổi, cập nhật chênh lệch trước code.

Trạng thái ngày11/10/2026: đã khảo sát UI/tài liệu và source public commit `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91`; chưa có implementation, test run hoặc deployment mới. Workspace hiện chứa tài liệu, không checkout Family-Organizer. Không coi cấu trúc file đề xuất là file đã tồn tại.

**Kết quả rà soát mới:** ưu tiên bỏ Bash/Docker updater, tập trung DATA_DIR, lifecycle/close DB, session/media ACL và thay full-collection rewrites bằng gateway có ownership. Giữ kiến trúc monolith và thuật toán nghiệp vụ đã chốt. Không viết lại toàn app hoặc nâng tất cả dependency cùng lúc. [Chi tiết bằng chứng, file và tests](2026-10-11-windows-native-foundation.md).

**Giới hạn cần phân biệt:** Codex Cloud không mặc định là Windows. GitHub-hosted windows-2019 đã ngừng, nên CI chuẩn dùng windows-2022; Windows2019 là cổng nghiệm thu riêng R02 trên server thật. Không cần người dùng cài Linux/Docker, nhưng không cam kết OS nội bộ hạ tầng OpenAI. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), [runner retirement](https://github.com/actions/runner-images/issues/12045).

## Global Constraints

- Ưu tiên người dùng: Eisenhower Matrix và Kanban; nâng cấp từ Kanban bốn cột hiện có, giữ approval/points/rotation.
- **Loại bỏ:** REST API công khai cho apps bên ngoài, token tích hợp có scope, MCP, đồng bộ ngân hàng. Không thêm menu/provider/schema/worker/endpoint cho chúng; chỉ giữ ghi nhận ngân hàng thủ công/file import.
- API nội bộ/auth Bearer Family-Organizer, phân quyền role+object grant vẫn cần thiết; F04 thêm session expiry/revocation và media ACL. Child/guest có task được phép; luôn bị chặn tài chính.
- Stack/storage theo repo; một deployment một gia đình, chưa SaaS/multi-tenant/billing mới.
- Task ID canonical chung List/Matrix/Kanban/Calendar; overdue derived, approval không completed; drag không sửa deadline âm thầm.
- Tiền API `minor:string`, bigint/SQLite INTEGER range check; VND0/USD2; không dùng reward points như tiền hoặc cộng vào net worth.
- Timestamp UTC, mặc định Asia/Saigon; due all-day/local dates và scheduled intervals khác deadline; no host-local Date.parse legacy.
- Một gateway transaction và registry migration/snapshot; Wallet/task tables prefix riêng, không sqliteSave xóa chúng; no dual-write.
- Role/object checks ở server cho query/direct route/SSE/attachment/export/notification/dashboard join; không dựa vào UI hiding.
- Một semantic command đi qua revision/idempotency/audit/outbox; exact delivery cho external push không được hứa, inbox/event claims dedupe.
- Native widgets/OS overlays/mobile-only/Premium behavior chưa verify là GAP/deferred; không hứa clone100% thuật toán TickTick/Wallet.
- Đọc AGENTS/CLAUDE đúng checkout; CodeGraph chỉ khi repo có `.codegraph`, không tự index. Yêu cầu Windows của người dùng thay deployment Docker/Pi trước đây; cập nhật instructions/docs repo cho nhất quán.
- Không production secrets trong Cloud/PR jobs; không runner PR trên VPS production. Windows package test dùng đúng ZIP promote, R02 ghi OS/build/hash thật.

## Review Focus

1. Task tài chính hiển thị cho trẻ hoặc member thiếu quyền account: dashboard/calendar/search/push không được lộ amount/account/title riêng; I02/I03.
2. Hai worker hoặc hai client tạo cùng recurrence/claim/reward/payment: transaction+namespaced idempotency chặn trùng; I01/P10/W05/W12.
3. Legacy JSON writer ghi đè task mới hoặc reward vừa duyệt: writers phải chung gateway/canonical store, rollback nhất quán; I01/P02/I03.
4. Backup/restore schema hỗn hợp khi WAL đang ghi: giữ toàn bộ collections/table/media/ACL, không replay thông báo hay cấp điểm; I01/I03/P18/W17.
5. Matrix urgency/timebox/finance due bị trộn semantics và tự ghi tiền: preview đúng field, task completion không post Wallet; P06–P11/I02.

## 1. Những nâng cấp Family-Organizer cụ thể

| Hiện trạng REPO | Nâng cấp | Ý nghĩa sử dụng |
|---|---|---|
| Kanban Todo/Doing/Overdue/Completed cố định, chưa DnD | Sections/grouping/workflow boards, ordering, WIP, blocked/Review | Quản lý việc nhà/dự án và tránh ô Done bypass approval |
| Chưa Matrix | 2 presets, custom rules, overlap/unmatched, preview move/pin, Q2 timebox | Quyết định việc cần làm/phân công/lên lịch có giải thích |
| Date string, overdue status, filters riêng UI | Task model/timezone/query canonical, shared drawer/filters/search | Mọi view khớp cùng task và không đổi số liệu do timezone |
| Tasks/FamilyPlan/Notes tách luồng | Typed links, calendar projection, templates/checklist/subtasks | Tái sử dụng kế hoạch gia đình, không nhân đôi dữ liệu |
| Gate duyệt/điểm và rotation đã có | Characterization + atomic claims/recurrence | Giữ quy tắc nuôi dạy đang dùng, chống điểm/trùng kỳ |
| SQLite JSON collections | Bảng domain có transaction + adapters, snapshot chung | Di trú từng phần, query/index/restore chắc chắn |
| Tài chính account enum, number amount | Accounts/ledger/transfer/FX/import/report/budget/goals/debt/portfolio | Quản lý dòng tiền gia đình chi tiết theo plan Wallet |
| Dashboard/search/notifications hiện có | Widgets/nudge/query có ACL, weekly review/workload | Tổng quan công việc và nhắc hạn tài chính theo đúng người |
| Chưa xác nhận Focus/habit parity | Focus/habit/countdown sau mốc Matrix/Kanban | Đào sâu thói quen và đánh giá kế hoạch khi nền đã ổn |

## 2. Ba giai đoạn bắt buộc và thứ tự phát triển

**Giai đoạn1 — Nền tảng:** F01–F09 +I01. Chuyển Windows-native, baseline rồi sửa mọi failure, CI/test/package/service đạt. Không thêm tính năng mới khi nền còn đỏ. Chưa gọi VPS2019-ready trước R02.

**Giai đoạn2 — Phát triển:** milestones dưới đây; Matrix/Kanban trước, mỗi PR có tests phù hợp và Windows CI. AI/DB/UI mở rộng theo prompt riêng, không gộp cả chương trình vào một task Cloud.

**Giai đoạn3 — Triển khai:** R01 candidate từ CI đúng SHA → R02 nghiệm thu Windows Server2019 → R03 cài exact artifact lên production, smoke/backup/monitor. CI đạt không tự cho phép push bản mới lên VPS.

| Milestone | Tasks/phần việc | Điều kiện nghiệm thu |
|---|---|---|
| M0 — domain sau nền Windows | P01–P05; W01–W04 khi bắt đầu nhánh tài chính, reuse I01 đã đạt | Migration thử, role/object ACL, một task core; finance vẫn flag-off |
| M1 — **Matrix + Kanban đầu tiên** | P06–P10, P17 phần keyboard/mobile/cache isolation; P18 tests Matrix/Kanban/reward/restore | Preview drag/cancel/conflict, custom columns/grouping/WIP, child→Review, đúng điểm/rotation; không cần chờ Focus/Habit |
| M2 — Wallet core | W05–W11, tests tương ứng W17 | Accounts/transactions/transfer/dashboard/report/import/export/rules; không sync ngân hàng |
| M3 — điều phối gia đình | P11–P13, W12–W14, I02 | Lịch/nhắc/notes, recurring/budgets/debt/goals; task link Wallet không tự ghi tiền |
| M4 — chiều sâu | P14–P16, W15 | Focus/habits/countdown/review, portfolio coverage/quotes đúng |
| M5 — hoàn thiện để tạo candidate | P17 còn lại/P18 full; W16–W18; I03 | End-to-end cross-module, privacy/backup/performance Windows và pilot/rollback; chuyển R01–R03 |

P18/W17 là chủ sở hữu bộ tests chung của module: thêm tests khi mỗi milestone cần, chạy lại full tại M5; không đánh dấu toàn task đã hoàn thành ở M1. Mỗi milestone phải usable với modules sau đang tắt; không đặt UI placeholder giống feature đã chạy.

Ước lượng cũ Wallet49–87 +Productivity52–88 +Integration6–10 =107–185 ngày công chỉ là **lịch sử phạm vi tính năng**, chưa bao gồm chuyển nền Windows và không còn là tổng dự án. Sau F01 lập estimate dựa failures/runtime/toolchain thật, trừ overlap I01/F07 và I03/R; sau F09 cập nhật theo throughput thực. Không lập deadline thiếu cơ sở hoặc cộng lại các task shared.

Khi nguồn lực hạn chế: hoàn thành giai đoạn1 rồi M0/M1 trước; giữ tài chính hiện có qua adapter/flag tới M2. Các milestones là phiên bản phát triển, không tự deploy production khi xong từng milestone.

## 3. Integration contracts và ownership

| Shared capability | Owner | Consumers / không tự tạo lại |
|---|---|---|
| SQLite write gateway/transaction+legacy collection adapter | I01 | W02/P02/P10 và mọi reward writers |
| Migrations, manifest backup/restore và feature flags | I01, full verification I03 | W03/W17–18/P02/P18 |
| Actor/auth, common HTTP errors, object ACL contracts | I01 gateway; W04/P03 domain checks | Router, media, search, snapshots/views |
| Job leases/outbox namespace and scheduler registration | I01 | W12/P10/P12/P14/P15 |
| Family dashboard/calendar/task-finance links | I02 | W08–09/W12–14/P05/P11/P16 |
| Date UI/i18n/theme/cache clearing/command palette | P17 +W16 consumer | Giữ cài đặt của repo, không tạo hai logout/theme flows |
| Cross-module E2E/privacy/performance evidence | I03 | P18/W17–18; F05 cung cấp CI |
| Windows paths/lifecycle/security/platform/package/service | F01–F09 | Mọi P/W/I reuse; không build hạ tầng riêng |
| Release candidate/Server2019 acceptance/production | R01–R03 | I03 cung cấp feature evidence; F06–F08 cung cấp automation |

`server/appStore.ts` export `AppWriteTx`, `withAppWriteTransaction<T>(meta:{actorId:string;command:string;requestId:string;payloadHash:string},fn:(tx:AppWriteTx)=>T):T`; `server/appMigrations.ts` registry version; `server/appSnapshot.ts` common manifest; `server/appJobs.ts` handlers namespace; `src/features/shared/domainLinks.ts` typed refs và `server/domainLinks.ts` permission-aware join.

`AppWriteTx` synchronous, cùng SQLite handle như collections hiện có; domain callback không network hoặc await. API input normalize request UUID→Wallet `idempotencyKey` hoặc Productivity `requestId`; không tạo hai records retry khác namespace cho cùng command. Job handles external network sau commit, ghi results/retries qua transaction mới.

`RewardStoreTx.applyCompletionGrant/Reverse` cập nhật collection điểm hiện có qua **cùng tx handle**, giữ IDs và shape để modules reward đọc được. Mọi writer points/spends/adjustments phải serialize qua gateway; chỉ thay writer adapter cần thiết, không thêm ledger tiền/điểm song song. Task claim unique như P10 là chống trùng, không ledger canonical thứ hai. Test legacy collections save không clobber new prefixes hoặc concurrent reward update.

Common validation module dùng lại khi semantics giống nhau, không đồng nhất `Money` và points hoặc task lifecycle và payment settlement. Task ownership không tự cấp quyền financial account.

## 4. Tasks tích hợp

### Task I01: Gateway, migration registry và snapshot chung

**Files:** Create `server/{appStore,appMigrations,appSnapshot,appJobs}.ts`, `server/appStore.test.ts`, `server/appSnapshot.test.ts`; Modify `server/sqlite.ts`, `server/db.ts`, existing backups/scheduler writers, `server.ts`. Exact source lines xác nhận lại trên checkout trước edit. Tích hợp files W02/P02, không tạo hai connection managers.

**Interfaces:** gateway/tx/registry ports ở section3; `registerDomainMigration(namespace:string,version:number,fn:(tx:AppWriteTx)=>void):void`; `collectAppSnapshot(tx:AppWriteTx):AppSnapshot`; `validateAppSnapshot(snapshot:unknown):ValidatedAppSnapshot`; `restoreAppSnapshot(snapshot:ValidatedAppSnapshot):RestoreReport`; `registerAppJob(namespace,type,handler):void`. Manifest `{schemaVersion,domains:{wallet:number,productivity:number},legacyVersion,mediaManifest,checksum,createdAt}`.

- [ ] Tests transaction ghi một task+reward claim+legacy points+Wallet adjustment giả rồi throw: tất cả rollback; legacy save chỉ cập nhật collections được sở hữu, không xóa prefixes. Hai serialized reward writers giữ tổng, không lost update. Retry request cùng hash trả result cũ, hash khác409.
- [ ] Tests snapshot lúc WAL đang ghi gồm task/finance/points/media/version, restore invalid checksum/missingrequired namespace không swapDB; restore suspend workers, drop undelivered historic effects theo restore policy, resume new future jobs. Migration registry mỗi namespace đúng thứ tự, chạy lại không duplicate.
- [ ] Run targeted tests trên Windows Actions, FAIL trước implement. Implement gateway chung/synchronous callbacks/nested tx policy reject or reuse explicit; dirty-row/dirty-collection adapter phối hợp `sqliteSave`, online backup API hoặc consistent logical snapshot với media manifest. Không dùng stale full snapshots ghi đè collection vừa được command khác thay đổi; audit mọi legacy writer trước bật domain mới.
- [ ] Add job namespace unique key/lease/retry registry; migrations theo domain flags nhưng shared manifest biết namespaces absent/disabled rõ; không chạy new migrations ngoài pilot snapshot khi chưa cutover. Run tests/lint, review tất cả task/reward writers đã đi gateway.
- [ ] Commit `refactor(storage): coordinate domain writes migrations and recovery`. I01 ước lượng2–4 ngày; nếu legacy points writer audit lớn hơn thì re-estimate trước triển khai P10.

### Task I02: Dashboard, lịch và link công việc–tài chính

**Files:** Create `server/domainLinks.ts`, `server/domainLinks.test.ts`, `src/features/shared/domainLinks.ts`; Modify Dashboard/GlobalSearch/Schedules/QuickNudge/Wallet+Productivity widgets và notification handlers.

**Interfaces:** `getFamilyOverview(actor:AppActor,range:Period):FamilyOverview`; `linkObjects(ctx,from:DomainRef,to:DomainRef):DomainLink`; `resolveDomainLink(actor,linkId):VisibleDomainLink|null`; `draftWalletPaymentFromTask(actor,taskId):PaymentDraft`. `DomainRef={kind:'task'|'familyPlan'|'note'|'walletRecord'|'walletSchedule'|'debt'|'goal'|'receipt';id:string}`. Draft chỉ có fields được actor phép đọc; create/post dùng Wallet command explicit.

- [ ] Tests adult được phép account thấy due widget/draft; child và member thiếu grant không thấy amounts/account names hoặc suy ra task title tài chính từ search/count/push. Link/task visibility bị hạ quyền phải redact ngay; không dùng title cache chưa kiểm ACL.
- [ ] Test task “thanh toán hóa đơn” completed→**0 Wallet postings**; mở draft rồi hủy vẫn0; adult confirm qua W05 tạo1 linked record với UUID, retry vẫn1. Timer/habit/task completion không cộng cash/networth hoặc bỏ qua approval. Reward points hiển thị riêng tiền.
- [ ] Run `npm test -- server/domainLinks.test.ts` FAIL; implement typed links/FKs/actor intersections, overview query chỉ dữ liệu có quyền, workers check recipients tại send. Finance-derived reminders/tasks mặc định adult-private, không shared cho trẻ.
- [ ] UI home: My Tasks/Family Kanban/Matrix/Q2/Waiting Review/nhắc hạn Wallet khi được phép; calendar events typed readonly finance reminders; mở domain gốc qua deep link, no double source task. Test/lint và drilldown đúng IDs.
- [ ] Commit `feat(family): connect planning finance and household overview`. Ước lượng2–3 ngày; không bắt buộc task finance autopost hoặc email/chat integrations.

### Task I03: Nghiệm thu toàn hệ thống và phát hành

**Files:** Create `tests/e2e/family-upgrade.spec.ts`, `docs/family-upgrade/{coverage,operations,rollout}.md`; Modify common test/CI/backup settings/version docs; consume P18/W17 results, không viết lại toàn bộ tests module.

**Interfaces:** `createFamilyUpgradeFixture(seed:number):AppSnapshot`; `auditFeatureCoverage():CoverageReport` trạng thái verified/implemented/partial/gap/excluded; feature flags independently walletV2/productivityV2, canonical versions checked before activation.

- [ ] E2E một gia đình giả: adult tạo task, child submit, adult approve→onepointgrant; Matrix/Kanban views đúng; schedule xuất hiện calendar; adult Wallet transfer/import/budget đúng; child trực tiếp API tài chính403; private joined notifications không leak.
- [ ] Backup while task+Wallet writes→restore vào DATA_DIR synthetic riêng trên Windows giữ money/task/points/proof/rank/pins/ACL/occurrences; no point/payment/notification replay; các tổ hợp flags off/on/pilot không two-write hoặc mất tính năng legacy. Rollback có writes sau cutover phải qua recovery/delta reconciliation, không tự restore snapshot cũ.
- [ ] Run quality/unit/integration/build/module E2E +`tests/e2e/family-upgrade.spec.ts` theo F05 trên Windows; record commit/testcount/OS/Node/run URL/exit0. Benchmark theo P18/W17, Windows package/service theo F06–F07; không coi CI2022 là nghiệm thu2019.
- [ ] Rà Coverage bảng section5 và G/T gaps; removed REST/scopedtoken/MCP/bank sync không có routes/schema/menus/jobs được đăng ký. Review output screenshot với synthetic data; secret/private fixtures không vào git/docs.
- [ ] Pilot review synthetic/sanitized migration reports+opening money+reward balances; rollback rehearsal, bàn giao version/SHA/coverage cho R01–R03. Commit `test(family): validate planning finance permissions and recovery`. Ước lượng2–3 ngày cũ cần hiệu chỉnh sau F01; không tính trùng package/VPS acceptance.

## 5. Coverage và quyết định deferred

| Năng lực | Owner | Phạm vi |
|---|---|---|
| Task/lists/tree/drawer/filter/search | P01–P05 | Core |
| Matrix presets/rules/preview/drag/pins | P06–P07 | **Ưu tiên cao nhất** |
| Kanban sections/workflow/group/WIP/rank | P08–P09/P10 | **Ưu tiên cao nhất** |
| Reward/approval/repeat/rotation | P10/I01 | Regression-critical |
| Calendar/timeline/notifications/collaboration/notes | P11–P13/I02 | Phase sau Matrix/Kanban |
| Focus/habit/countdown/review | P14–P16 | Phase sau core |
| UX/NLP draft/AI/offline | P17/W16 | UX core; AI draft theo yêu cầu có ACL/evals/cost-limit/confirmation như Windows plan; offline writes optional |
| Accounts/ledger/transfer/filter/report/dashboard/import/export/rules | W01–W11 | Wallet scope đã chốt |
| Recurring bills/budget/debt/goals/forecast | W12–W14 | Family financial planning |
| Portfolio/quotes | W15 | Giá thị trường, không trading brokerage |
| Settings/backup/performance/rollout | W16–W18/P17–P18/I03/F/R | Cross-module verification + Windows release gates |
| Public REST/API credentials/MCP/bank sync | Không có | **Excluded theo yêu cầu** |
| OAuth externalcalendar/Notion/Zapier/IFTTT/email/chat/CLI | Không có task production | Deferred; file import/ICS nội bộ trước |
| Native OS widgets/sticky notes/mobilevoice/mindmap/premium billing | Không có | Không phải web parity cam kết; optional study riêng |

Những mô tả REST/MCP/bank trong bản khảo sát Wallet/TickTick là bằng chứng sản phẩm tham chiếu, **không** là requirement implement. Custom Matrix/WIP/approval safeguards là NEW; không gán chúng cho TickTick khi chưa kiểm chứng.

Kết quả cần review khi bắt đầu thực thi: shared manifest/gateway design, task ACL mở rộng server, migration timezone/overdue, characterization reward/rotation/reopen, Matrix inverse-move policy và ngân sách giai đoạn ưu tiên. Không cần triển khai source hoặc kết nối services chỉ để đọc plan.

## 6. Kịch bản nghiệm thu chung

1. Tạo task high/noDate: Q2 của deadline preset, Q1 của priority-only; cùng ID ở list/board, không copy.
2. Chuyển Matrix Q2→Q1: đọc patch, cancel không change; pin giữ due, bỏ pin về classifier; ngày tới tự đổi khi không pin.
3. Đổi section sang tên Done không check completed; workflow Done trẻ cần approval vào Review, điểm0; approve retry điểm chỉ1event.
4. Hai client cùng hard-WIP lane: một move được nhận, move còn lại conflict/limit; không card bị mất hoặc đứng hai cột canonical.
5. Recurring household chore ngày31/rotation/skip/accepted approval theo P10; virtual future preview không có điểm/postings.
6. Timebox task Q2 trong lịch thay scheduledStart/end, giữ deadline; all-day/timed/timezone boundary đúng.
7. Wallet Cash→Bank cùngcurrency neutral family cashflow; import retry/undo/budget/debt/goal không double theo W tests.
8. Child/guest/private member không lấy được tài chính hay task/link private qua direct API/search/SSE/media/export/push.
9. Hoàn thành task hóa đơn không tự ghi expense; chỉ confirm draft Wallet của actor có quyền mới post một lần.
10. Restore combined backup sau write/restart không đổi tổng tiền/điểm/thứ tự task hoặc phát lại reminders cũ.

Plan đã tự rà task namespaces/dependencies/scope. Acceptance tests là yêu cầu sẽ chạy khi triển khai, chưa phải bằng chứng đã pass. **Entry point thực thi mới là F01 trên Codex Cloud**, rồi F01–F09 +I01 trước M0/M1. Bộ [hướng dẫn và prompts](2026-10-11-codex-cloud-windows-guide-and-prompts.md) mô tả đưa tài liệu vào repo, tạo environment, mở PR, đọc Windows CI và cổng nghiệm thu VPS. Phiên rà soát này chỉ cập nhật tài liệu, chưa sửa source repo hoặc chạy tests trên PC.
