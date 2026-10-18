# Wallet cho Family-Organizer Implementation Plan

**Repo thực thi duy nhất:** [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), branch `main`; branch/PR/CI thực hiện trong repo này theo master.

> **For agentic workers:** Thực thi từng task bằng Codex Cloud theo master/AGENTS; dùng Superpowers khi skill thực sự có trong environment. Checkboxes theo dõi việc đã có bằng chứng; không giả định skill/plugin trên PC tồn tại trong Cloud.

**Goal:** Nâng cấp module tài chính Family-Organizer với hành vi Wallet web đã xác minh, cùng ngân sách, lịch định kỳ, nợ, goals và chia sẻ gia đình trên web.

**Architecture:** Module frontend/backend trong repo Family-Organizer, dùng chung auth, UI và SQLite. Tài chính dùng bảng quan hệ và transaction nguyên tử; adapter chuyển các endpoint cũ sang cùng một store sau migration. Worker nhẹ trong Node xử lý lịch, import, tỷ giá và giá tài sản.

**Tech Stack:** React19/TypeScript5.8/Vite6/Tailwind4/Motion/Lucide/i18next; Express4/SQLite/Vitest/pdfmake/PWA. Node24 LTS x64/better-sqlite3 tương thích khóa qua F01; Windows Service/ZIP/PowerShell theo [plan Windows](2026-10-11-windows-native-foundation.md). Parser spreadsheet/OFX, decimal/E2E chọn theo task; không chuyển Next.js/PostgreSQL.

**Spec:** [Khảo sát và thiết kế](../specs/2026-10-11-wallet-research-and-design.md).

**Plan cuối cùng:** [Family-Organizer Upgrade](2026-10-11-family-organizer-upgrade-master.md) điều phối theo3giai đoạn: F01–F09 +I01 nền Windows, phát triển Matrix/Kanban rồi Wallet, R01–R03 triển khai. Task1–18 dưới đây là W01–W18; I01 sở hữu gateway/migration/snapshot/worker chung, không tạo lại hạ tầng. Code bằng Codex Cloud, mọi checks chuẩn chạy Windows Actions; không cần PC chạy. Phạm vi tài chính đã chốt giữ nguyên.

**Phạm vi cập nhật 11/10/2026:** Bỏ REST API công khai cho ứng dụng bên ngoài, token tích hợp có scope, MCP và đồng bộ ngân hàng. Không tạo provider ngân hàng, màn hình kết nối, công cụ MCP, cơ chế cấp token tích hợp hoặc endpoint cho các tính năng này. Giữ API nội bộ phục vụ giao diện, auth Bearer hiện có, phân quyền tài khoản, nhập file và tài khoản theo dõi ngân hàng thủ công. Tỷ giá và giá thị trường phục vụ portfolio vẫn thuộc phạm vi.

**Trạng thái:** plan để review; chưa thực thi, chưa có app/module/test mới trong thư mục này. Người dùng yêu cầu lập plan, không yêu cầu triển khai ngay. Đọc spec và plan cùng nhau trước khi làm. Các path code dưới đây thuộc repo Family-Organizer và path mới là đề xuất; không coi chúng đã tồn tại trong `wallet-app`.

## Global Constraints

- Stack và storage theo spec phương án 2; không rewrite các module gia đình khác.
- API tiền dùng `minor: string`; bigint arithmetic, INTEGER SQLite có kiểm tra signed 64-bit; VND exponent 0, USD 2.
- Quantity/price instrument decimal string tối đa 8 chữ số thập phân; money rounding half-up tại biên.
- Timestamp UTC ISO, timezone `Asia/Saigon` mặc định; giữ `effectiveDate` legacy, không bịa giờ cũ.
- Child/guest không xem tài chính; permission phải ở server cả list/report/export/media/API nội bộ.
- Ghi transfer/debt/goal/import cùng transaction; mọi mutation có revision và idempotency.
- Không triển khai đồng bộ ngân hàng, REST API công khai, token tích hợp có scope hoặc MCP.
- Không đưa số dư, file nhập, token đăng nhập hoặc thông tin cá nhân thật vào fixtures/logs/plan.
- Giữ auth Bearer nội bộ đã harden ở F04, feature flags/PWA; DATA_DIR ngoài release, backup/restore Windows theo F07/I01; version/tag/ZIP theo F08/R01–R03, không Docker volume/image.
- Các chức năng ghi vào Wallet thật hoặc tích hợp dịch vụ bên ngoài không được thực hiện chỉ vì plan có mô tả chúng.
- G01–G12 trong spec phân biệt phần cần xác minh và phần ngoài phạm vi; G10 không triển khai. Nghiệm thu theo phạm vi đã chọn, không dùng nhãn tương đương 100% Wallet.

## Review Focus

1. Legacy giao dịch, debt payments và savings contributions đã biểu diễn cùng tiền: migration/link không ghi gấp đôi; test Task 3 và 13.
2. Member chỉ đọc một đầu transfer: list/chart/export/audit không lộ đầu kia; test Task 4, 6, 8 và 17.
3. Timeout/retry/multi-client/restart: cùng request hoặc occurrence không tạo thêm posting; test Task 5, 10, 12 và 17.
4. Ngày mơ hồ, ngày 31, leap year, giờ qua nửa đêm: reject/chốt timezone đúng và có policy; test Task 1, 10, 12.
5. Backup khi WAL đang ghi và restore schema cũ: phục hồi nhất quán, bảo toàn tiền/media; test Task 2, 3 và 17.

## 1. Lộ trình và dependency

| Đợt | Tasks | Kết quả có thể nghiệm thu độc lập | Ước lượng công kỹ thuật* |
|---|---|---|---|
| A — nền dữ liệu | 1–4 | Money/DB/migration/quyền có tests; feature còn tắt | 8–14 ngày |
| B — tài khoản và ghi chép | 5–7 | Số dư, transfer, form, filter, bulk, danh mục, nhãn, mẫu | 10–18 ngày |
| C — báo cáo và dữ liệu | 8–11 | Dashboard, advanced reports, import/export, rules | 10–18 ngày |
| D — lập kế hoạch gia đình | 12–14 | Định kỳ, nợ/goals, ngân sách/dự báo | 8–14 ngày |
| E — đầu tư | 15 | Portfolio, giao dịch đầu tư, giá thị trường | 5–9 ngày |
| F — trải nghiệm/phát hành | 16–18 | PWA/settings, migration/restore/performance, rollout | 8–14 ngày |

*Ước lượng49–87 ngày công là baseline lịch sử riêng Wallet, chưa gồm nền Windows; hiệu chỉnh sau F01/F09, trừ phần I01/F07 dùng chung. Không phải deadline. Bản usable sau đợt B vẫn là bản phát triển; production chỉ sau R01–R03. Không có mốc bank sync/API công khai.

Dependency chính: 1 → 2 → 3 → 4 → 5 → 6; 5–7 → 8–11; 5+8 → 12–14; 5+8 → 15; 4+6+9 → 16; tất cả năng lực phát hành → 17 → 18. Đợt E chỉ dùng nguồn tỷ giá/giá thị trường, không kết nối ngân hàng hoặc tài khoản môi giới.

## 2. Cấu trúc file

| Vùng | File mới/đổi | Trách nhiệm |
|---|---|---|
| Shared | `src/features/wallet/contracts.ts`, `money.ts`, `dates.ts`, `filter.ts` | DTO, money, thời gian, filter dùng chung |
| DB | `server/wallet/schema.ts`, `store.ts`, `migrate.ts`, `snapshot.ts` | Schema, repository, migration và backup |
| Domain | `server/wallet/accounts.ts`, `records.ts`, `access.ts`, `reports.ts` | Quyền và logic lõi |
| Danh mục | `server/wallet/catalog.ts`, `templates.ts`, `rules.ts` | Cây, nhãn, mẫu, quy tắc |
| Dữ liệu | `server/wallet/imports.ts`, `parsers/*`, `exports.ts` | Stage/preview/commit/export |
| Planning | `server/wallet/schedules.ts`, `budgets.ts`, `links.ts`, `jobs.ts` | Occurrences, budget, debt/goal links, worker |
| Đầu tư | `server/wallet/investments.ts`, `marketData.ts` | Portfolio, quotes và nguồn giá thị trường |
| Router | `server/wallet/router.ts`, `legacy.ts` | Mount Express và adapter API cũ |
| Frontend | `src/features/wallet/Wallet.tsx`, `api.ts`, `useWallet.ts` | Shell, fetch authenticated, state lifecycle |
| UI | `AccountList.tsx`, `AccountForm.tsx`, `AccountDetail.tsx`, `RecordForm.tsx`, `RecordList.tsx`, `FilterPanel.tsx`, `Catalog.tsx`, `Templates.tsx` | Tài khoản và ghi chép |
| UI tiếp | `Dashboard.tsx`, `Widget.tsx`, `Analytics.tsx`, `Charts.tsx`, `ImportWizard.tsx`, `Rules.tsx`, `Planning.tsx`, `Portfolio.tsx`, `WalletSettings.tsx` | Báo cáo và các luồng nâng cao |
| Repo hiện có | `src/App.tsx`, `src/components/Finance.tsx`, `src/types.ts`, `server.ts`, `server/db.ts`, `server/sqlite.ts` | Wiring, cutover, compatibility, snapshot |
| UI hiện có | `src/components/Assets.tsx`, `DebtTracker.tsx`, `SavingsGoals.tsx`, i18n resources | Nối module hiện có, giữ locale/styles |

Tests domain đặt cạnh file `*.test.ts`, API test trong `server/wallet/*.api.test.ts`, browser trong `tests/e2e/wallet.spec.ts`. Không tách hết source cũ ra nhiều file trong cùng PR chỉ để làm đẹp; chỉ tách các trách nhiệm phục vụ module mới.

## 3. Hợp đồng kiểu dùng giữa tasks

Task 1 tạo và export các type này trong `contracts.ts`; các task sau mở rộng DTO domain nhưng không đổi ý nghĩa money/filter:

```ts
type Id = string;
type Minor = string;
type CurrencyCode = string;
type Money = { minor: Minor; currency: CurrencyCode };
type Actor = { userId: Id; role: 'admin'|'member'|'child'|'guest' };
type Revision = number;
type CommandContext = { actor: Actor; idempotencyKey: string; expectedRevision?: Revision };
type Source = 'manual'|'import'|'schedule'|'legacy';
type RecordKind = 'income'|'expense'|'transfer'|'adjustment'|'trade';
type Settlement = 'uncleared'|'cleared'|'reconciled'|'voided';
type Period = { fromDate: string; toDateExclusive: string; timezone: string };
type RecordFilter = {
  period: Period; accountIds?: Id[]; categoryIds?: Id[]; labelIds?: Id[];
  labelMatch?: 'any'|'all'; currencies?: CurrencyCode[]; kinds?: RecordKind[];
  statuses?: Settlement[]; paymentMethods?: string[]; creatorIds?: Id[];
  transferMode?: 'include'|'exclude'|'only'; query?: string;
  absoluteMin?: Minor; absoluteMax?: Minor; referenceCurrency: CurrencyCode;
};
type Page<T> = { items: T[]; nextCursor: string|null; total: number };
type DomainErrorCode = 'INVALID_INPUT'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'RATE_UNAVAILABLE'|'LIMIT_EXCEEDED';
```

Array trong cùng chiều filter dùng OR, giữa các chiều dùng AND; labels tùy `any/all`, category gồm descendants; mặc định `any`. Period luôn `[fromDate,toDateExclusive)`. Các `CommandContext` key từ client UUID được lưu unique theo actor+route+key với payload hash; cùng key khác payload trả CONFLICT. Mutation response có `revision`; error DTO `{code,message,fields?,requestId}`; HTTP 400/403/404/409/422 theo loại lỗi, không trả stack/secret.

## 4. Các tasks thực thi

Mỗi task có chu kỳ test đỏ → code tối thiểu → test xanh → lint → commit. Không commit tài liệu/cài dependency thay cho deliverable; test phải chứng minh hành vi, không chỉ mirror tên function. Các lệnh dưới đây chạy trong checkout Family-Organizer sau `npm ci`, không chạy ở folder plan trống.

### Task 1: Money, thời gian và contract

**Files:** Create `src/features/wallet/{contracts,money,dates,filter}.ts` và `money.test.ts`, `dates.test.ts`, `filter.test.ts`.

**Interfaces:** `parseMoney(text:string,currency:CurrencyCode,locale:string):Money`; `formatMoney(m:Money,locale:string):string`; `addMoney(a:Money,b:Money):Money`; `convertMoney(m:Money,target:CurrencyCode,rate:{numerator:Minor;denominator:Minor}):Money`; `resolvePeriod(input:{kind:'week'|'month'|'year'|'custom';anchorDate:string;fromDate?:string;toDateExclusive?:string},timezone:string):Period`; `normalizeFilter(raw:unknown):RecordFilter`.

- [ ] Viết test `vnd_integer_usd_cents_and_overflow`: VND `150000` → `"150000"`, USD `12.34` → `"1234"`; `0.1+0.2` USD → `"30"`; currency khác từ chối; VND 1.2 không tự làm tròn; signed 64-bit overflow từ chối. Test locale VN `1.234,56` chỉ chấp nhận theo locale/currency đã chọn.
- [ ] Viết `month_boundaries_and_leap_year`: tháng 2/2028 có end-exclusive 2028-03-01; 23:30 UTC 10/10 thuộc effectiveDate 11/10 ở Saigon; ngày 01/02 mơ hồ phải có format. Test labels any/all và category descendants bằng fixture.
- [ ] Chạy `npm test -- src/features/wallet/money.test.ts src/features/wallet/dates.test.ts src/features/wallet/filter.test.ts`; trước code phải FAIL vì chưa có module.
- [ ] Implement contract và bigint/scale exact; dùng period helper hiện có khi semantics tương thích, giữ test cũ. Chạy lại lệnh và `npm run lint`, kỳ vọng PASS/exit 0.
- [ ] Commit `feat(wallet): define exact money and filter contracts`.

### Task 2: Bảng SQLite, transaction và snapshot

**Files:** Create `server/wallet/{schema,store,snapshot}.ts`, `store.test.ts`, `snapshot.test.ts`; Modify `server/sqlite.ts`, `server/db.ts`, `src/types.ts`.

**Interfaces:** `openWalletStore(db:Database):WalletStore`; `WalletStore.transaction<T>(fn:(tx:WalletTx)=>T):T`; `exportWalletSnapshot(store:WalletStore):WalletSnapshot`; `restoreWalletSnapshot(tx:WalletTx,snapshot:WalletSnapshot):void`. `WalletTx` cung cấp repositories account/record/posting/catalog/audit/idempotency và query typed; không network trong callback. Snapshot schemaVersion=2, arrays typed theo spec và tiền string.

- [ ] Test `foreign_key_and_unique_idempotency`: posting account không tồn tại bị từ chối, occurrence duplicate bị unique constraint; throw ở posting thứ hai rollback toàn record và audit.
- [ ] Test `legacy_snapshot_save_does_not_erase_wallet`: `sqliteSave` cũ không xóa bảng prefix wallet; snapshot mới có record/posting/attachments manifest và restore giữ tổng tiền.
- [ ] Chạy `npm test -- server/wallet/store.test.ts server/wallet/snapshot.test.ts`, xác nhận FAIL.
- [ ] Tạo các bảng entity ở spec với FK/index `(accountId,effectiveDate,id)`, source external key, importBatchId, record labels và actor+idempotency. Bật FK/WAL/busy timeout; binding BigInt, decimal fields TEXT; restore atomically toàn legacy+wallet qua một coordinator. Chạy tests và lint.
- [ ] Commit `feat(wallet): add transactional sqlite store and snapshots`.

### Task 3: Di trú và adapter dữ liệu cũ

**Files:** Create `server/wallet/{migrate,legacy}.ts`, `migrate.test.ts`, `legacy.test.ts`; Modify `server/db.ts`, `server.ts`, `src/types.ts`.

**Interfaces:** `migrateLegacyFinance(tx:WalletTx,input:LegacyFinanceSnapshot):MigrationResult`; result `{version:2,mapping,quarantined,counts,checksum}`. `projectLegacyRecord(record:WalletRecord):FinancialTransaction`; `readLegacyFinance(actor:Actor):FinancialTransaction[]`; mutations legacy gọi commands Task 5 sau khi được wire.

- [ ] Test `migration_twice_is_idempotent`: 3 enum account → 3 shared VND entities, ID record giữ nguyên, lần hai counts mới=0, totals giống cũ, opening=0 chưa đối soát.
- [ ] Test `legacy_linked_money_is_not_posted_twice`: payments/contributions chỉ migrate metadata legacy_unlinked, không tạo expense/income; date cũ giữ nguyên effectiveDate; amount invalid/currency lỗi có báo cáo cách ly.
- [ ] Test `old_backup_restores_to_new_schema` và `new_backup_rejects_unsupported_schema_before_write`; chạy `npm test -- server/wallet/migrate.test.ts server/wallet/legacy.test.ts`, phải FAIL đầu tiên.
- [ ] Implement version/checksum/mapping durable, backup trước migration, adapter old DTO rõ giới hạn (transfer không ép thành income/expense giả). Sau cutover legacy `/api/finance` đọc/ghi canonical store; chạy tests/lint.
- [ ] Commit `feat(wallet): migrate legacy finance without duplicate balances`.

### Task 4: Quyền tài khoản, API nền và file hóa đơn

**Files:** Create `server/wallet/{access,router}.ts`, `access.test.ts`, `access.api.test.ts`, `src/features/wallet/api.ts`; Modify `server.ts`, media serving handler hiện có.

**Interfaces:** `resolveAccountAccess(actor:Actor,account:WalletAccount,grants:AccountGrant[]):'none'|'read'|'contribute'|'manage'`; `authorizeRecord(actor:Actor,recordId:Id,action:'read'|'write',tx:WalletTx):void`; `visibleAccountIds(actor:Actor,tx:WalletTx):Id[]`; `mountWalletRoutes(app:Express,deps:WalletDependencies):void`; `walletRequest<T>(path:string,options:RequestInit):Promise<T>` dùng getAuthHeader hiện có.

- [ ] API nội bộ tests child/guest 403 cho mọi route tài chính; member private account khác 404; forged creatorId bị bỏ qua; admin behavior theo spec; grant read không cho tạo/sửa record và thiếu phiên đăng nhập bị401.
- [ ] Test transfer chỉ thấy một đầu không lộ account name/amount đầu còn lại; hóa đơn direct URL và export/chart/audit không bypass ACL. Chạy `npm test -- server/wallet/access.test.ts server/wallet/access.api.test.ts`, xác nhận FAIL.
- [ ] Implement middleware auth từ repo, kiểm tra role/grant và filter accessible IDs **trước query**. Media mới dùng authorized record endpoint; lập migration media URL cũ để không còn public receipt mới. Không thêm scope hoặc token tích hợp riêng cho Wallet.
- [ ] Chạy tests/lint; API error có requestId, không log token hoặc nguyên payload nhạy cảm; chuẩn hóa 400/403/404/409/422.
- [ ] Commit `feat(wallet): enforce account access across finance routes`.

### Task 5: Tài khoản, sổ giao dịch và transfer nguyên tử

**Files:** Create `server/wallet/{accounts,records}.ts`, `accounts.test.ts`, `records.test.ts`, `records.api.test.ts`; Modify `router.ts`, `legacy.ts`.

**Interfaces:** `createAccount(ctx:CommandContext,input:AccountDraft):WalletAccount`; `updateAccount(ctx:CommandContext,id:Id,patch:AccountPatch):WalletAccount`; `getBookBalance(actor:Actor,accountId:Id,date:string):Money`; `createRecord(ctx:CommandContext,input:RecordDraft):WalletRecord`; `updateRecord(ctx:CommandContext,id:Id,patch:RecordPatch):WalletRecord`; `voidRecord(ctx:CommandContext,id:Id):WalletRecord`. Draft union income/expense/adjustment có account+Money; transfer có source/destination nullable cho external, debit/credit Money, fee optional; trade do Task 15 xử lý.

- [ ] Test fixture opening Cash=1.000.000, Bank=2.000.000 VND; income 500.000 và expense 200.000 từ Cash, transfer Cash→Bank 300.000: cuối Cash=1.000.000, Bank=2.300.000; actual income=500.000, expense=200.000, net=300.000.
- [ ] Test hai currency 100 USD→2.500.000 VND bảo toàn amounts từng đầu; thiếu rate hoặc cùng account bị từ chối; fee 10.000 VND thành expense riêng. Crash posting thứ hai rollback; retry cùng key chỉ có một record; key khác payload CONFLICT.
- [ ] Test revision cũ HTTP409, void đảo ảnh hưởng số dư đúng, archive ngăn giao dịch mới nhưng giữ lịch sử, currency của account có lịch sử không đổi, credit balance -200.000/limit1.000.000 → available800.000/utilization20%. Chạy test filenames của Task, xác nhận FAIL.
- [ ] Implement atomic command + posting + audit + idempotency, correction record kind adjustment; record settlement/review theo spec; unlink nguyên tử khi void debt/goal/schedule record. Gắn legacy mutations cùng commands.
- [ ] Chạy test/lint và commit `feat(wallet): implement accounts and atomic financial records`.

### Task 6: UI tài khoản, form, filter, danh sách và bulk

**Files:** Create `src/features/wallet/{Wallet,AccountList,AccountForm,AccountDetail,RecordForm,RecordList,FilterPanel}.tsx`, `src/features/wallet/useWallet.ts`, `server/wallet/query.ts`, `query.test.ts`, `bulk.ts`, `bulk.api.test.ts`; Modify `src/App.tsx`, `src/components/Finance.tsx`, router và i18n resource đúng cây repo.

**Interfaces:** `listRecords(actor:Actor,filter:RecordFilter,cursor:string|null,limit:number):Page<WalletRecordView>`; `bulkUpdate(ctx:CommandContext,selection:{ids:Id[]}|{filter:RecordFilter;selectionToken:string},patch:RecordMetadataPatch):BulkResult`; `AccountForm({initial,onSave,onCancel})`, `RecordForm({draft,onSubmit,onCancel})`, `useWallet():WalletViewState`. Query cursor sort by effectiveDate,occurredAt,id; max page size 100. Bulk metadata có categories/labels/status/payee/note, không mass sửa số tiền/đối ứng transfer bản đầu.

- [ ] Test query AND across dimensions, OR within dimensions, labels any/all, hidden category descendants, absolute amount reference currency, same-date stable cursor không duplicate; unauthorized records không vào count.
- [ ] Bulk test selectionToken snapshot version không sửa các record đến sau; một ID trái quyền từ chối toàn bộ, stale revisions conflict; return count chính xác. Chạy `npm test -- server/wallet/query.test.ts server/wallet/bulk.api.test.ts`, xác nhận FAIL.
- [ ] Implement server queries, selection snapshots và bulk atomic; UI tabs Accounts/Records trong Finance, fields theo khảo sát, submit disabled/pending và draft giữ khi API lỗi; show two amounts FX; save-and-add-another chỉ reset sau server success.
- [ ] Verify bằng synthetic data: tạo account, income/expense/transfer, chỉnh sửa, conflict hai tab; filter, period, sort và phạm vi selection; keyboard/phone. Chạy tests/lint, existing tests; E2E sẽ được tự động hóa ở Task 17.
- [ ] Commit `feat(wallet): add account and record workflows with shared filters`.

### Task 7: Danh mục, nhãn, mẫu, clone và split

**Files:** Create `server/wallet/{catalog,templates}.ts`, `catalog.test.ts`, `templates.test.ts`, `src/features/wallet/{Catalog,Templates}.tsx`; Modify `RecordForm.tsx`, `records.ts`, `src/types.ts`, legacy category handlers.

**Interfaces:** `saveCategory(ctx:CommandContext,input:CategoryDraft):Category`; `saveLabel(ctx:CommandContext,input:LabelDraft):Label`; `saveTemplate(ctx:CommandContext,input:TemplateDraft):Template`; `instantiateTemplate(actor:Actor,id:Id,now:string):RecordDraft`; `cloneRecordDraft(actor:Actor,id:Id,now:string):RecordDraft`; `setAllocations(ctx:CommandContext,recordId:Id,rows:AllocationDraft[]):WalletRecord`.

- [ ] Tests cây max3 cấp, parent cycle reject, delete referenced category CONFLICT kèm references, hidden parent ẩn con khỏi lựa chọn nhưng report cũ còn; archived label không mất khỏi record/report.
- [ ] Template/clone không dùng lại ID/source key/schedule link, không tự ghi, archive account/template báo lỗi. Split 100.000=60.000+40.000, mismatch reject; book posting chỉ 100.000, report không cộng thêm parent. Chạy tests hai file, xác nhận FAIL.
- [ ] Implement category/label catalogs và map customCategories cũ; templates draft-only; default labels áp có giải thích. Không đưa hạn chế “5 nhãn” của Wallet vào ứng dụng mới nếu không cần: bản đầu giới hạn 20 để kiểm soát UI, thông báo rõ.
- [ ] Verify UI tree/nature/icon/color, template select trong form, clone mở draft, split tooltip; chạy tests/lint.
- [ ] Commit `feat(wallet): add catalogs templates and split allocations`.

### Task 8: Một bộ máy báo cáo dùng chung

**Files:** Create `server/wallet/reports.ts`, `reports.test.ts`, `fx.ts`, `fx.test.ts`; Modify router; Create `src/features/wallet/Analytics.tsx`, `Charts.tsx`.

**Interfaces:** `getReport(actor:Actor,input:{filter:RecordFilter;metric:'incomeExpense'|'balance'|'cashflow'|'cumulativeCashflow';groupBy:'none'|'account'|'category'|'label'|'creator';granularity:'day'|'week'|'month'|'year'}):ReportResult`; result `{series,totals,coverage,formulaVersion,asOf,drilldownFilters}`. `getFxRate(pair,date):FxRate|null`; `refreshRates(asOf:string):Promise<RefreshResult>` tách network khỏi DB transaction.

- [ ] Fixture Task5 report đúng income500k/expense200k/net300k; balance1m/2.3m dù filter chỉ Food; adjustment không biến thành income. Subset Cash transfer-out300k hiển thị movement riêng, family total không double. Void không tính, available loại uncleared theo policy.
- [ ] Test nhãn có overlap không cộng nhân đôi grand total; split sum, credit limit không cộng net worth; previous=0 không Infinity; missing rate coverage rõ; refresh rate hôm nay không đổi snapshot giao dịch cũ. Test report/export visibility chỉ một đầu transfer.
- [ ] Chạy `npm test -- server/wallet/reports.test.ts server/wallet/fx.test.ts`, phải FAIL trước code.
- [ ] Implement read aggregation chỉ theo quyền/filter, balances dùng sổ riêng không bóp méo do category filter. UI bốn tab, Line/Bar/Area dùng SVG có accessible table; nếu chọn chart library thì kiểm tra primary docs/package và bọc trong Charts.tsx, không đổi API reporting.
- [ ] Chạy tests/lint, kiểm tra drilldown ID set khớp report, commit `feat(wallet): unify reports balance series and currency conversion`.

### Task 9: Dashboard cá nhân, saved filters/charts/widgets

**Files:** Create `server/wallet/preferences.ts`, `preferences.test.ts`, `src/features/wallet/{Dashboard,Widget}.tsx`; Modify Analytics/FilterPanel/Wallet và App dashboard integration.

**Interfaces:** `savePreference(ctx:CommandContext,kind:'filter'|'chart'|'layout',value:WalletPreference):WalletPreference`; `getPreferences(actor:Actor):WalletPreferences`; `Widget({config,report,onDrilldown})`; config typed WidgetKind và `RecordFilter` override. Types cover summary,balanceTrend,cashflow,periodComparison,cashflowTrend,expenseStructure,expenseNature,recentRecords,accounts,currencyBalances,categorySpend,creditUtilization.

- [ ] Test preference owner isolation/revision conflict/schema upgrade; unauthorized account IDs trong config không expose numbers sau quyền thay đổi; unknown widget type gracefully báo unsupported.
- [ ] Chạy `npm test -- server/wallet/preferences.test.ts`, xác nhận FAIL; implement versioned prefs, cache key theo actor/filter/recordRevision/quoteAsOf, không cache chéo người dùng.
- [ ] UI thêm/remove/reorder/resize với keyboard controls; save filter/chart/layout per-user; empty/loading/error khác nhau, bỏ dữ liệu sample ra khỏi widget thật.
- [ ] Verify reload giữ layout, compare same-length kỳ trước và cùng kỳ năm trước theo helper, mobile cards xếp lại. Chạy tests/lint.
- [ ] Commit `feat(wallet): persist personal dashboards filters and charts`.

### Task 10: Nhập CSV/XLS/XLSX/OFX và undo

**Files:** Create `server/wallet/imports.ts`, `parsers/{csv,spreadsheet,ofx}.ts`, `imports.test.ts`, `imports.api.test.ts`, `src/features/wallet/ImportWizard.tsx`; Modify package files nếu cần parser, jobs/router.

**Interfaces:** `stageImport(ctx:CommandContext,file:ImportFile):Promise<ImportBatch>`; `previewImport(actor:Actor,batchId:Id,mapping:ImportMapping):ImportPreview`; `commitImport(ctx:CommandContext,batchId:Id,previewRevision:Revision):ImportResult`; `undoImport(ctx:CommandContext,batchId:Id,policy:'onlyUnmodified'|'rejectIfModified'):UndoResult`. Mapping có format date/locale, delimiter/header/start/end, amount/date/payee/note/currency/category/labels, account target. Batch stage ttl24h; limits file20MiB/10.000 rows cho bản đầu.

- [ ] Fixtures UTF8 BOM, dấu tiếng Việt, quoted commas/newlines, semicolon, XLS sheet selector, OFX source ID, DD/MM/YYYY và MM/DD/YYYY. Preview không tạo record; NaN/Infinity/mixed currency/bad date/repeated header có row errors; ambiguous date yêu cầu chọn format.
- [ ] Dedupe bản ghi nhập OFX theo account + namespace tổ chức/tài khoản trong OFX + FITID; namespace phải ổn định giữa các file, không dùng hash/tên file làm namespace. Test hai file khác nhau có cùng FITID chỉ đề xuất một record. CSV hash chỉ là gợi ý khi không ID, không âm thầm bỏ hai lần chi giống nhau. Không có nguồn sync ngân hàng. Retry commit cùng key không trùng; preview stale reject; late parser failure không ghi partial. Undo modified record bị chặn/cho explicit policy, không cascade nhầm record nối debt/goal.
- [ ] Chạy test hai file, FAIL; chọn parser từ nguồn chính thức có license phù hợp, không evaluate formula/macro/external link; parse/network ngoài transaction, commit batch ngắn và job progress.
- [ ] UI 5 bước: account/file → cấu trúc sheet/range → mapping → preview/errors/duplicates → commit/results/history/undo. Không import khi còn row error mà người dùng chưa lựa chọn cách xử lý rõ. Chạy tests/lint và fixture10k.
- [ ] Commit `feat(wallet): add validated imports with preview and safe undo`.

### Task 11: Export và rule engine có preview

**Files:** Create `server/wallet/{exports,rules}.ts`, `exports.test.ts`, `rules.test.ts`, `src/features/wallet/Rules.tsx`; Modify RecordList/router; reuse pdfmake.

**Interfaces:** `exportRecords(actor:Actor,selection:RecordSelection,format:'csv'|'xlsx'|'pdf'):ExportStream`; `previewRules(actor:Actor,rule:RuleDraft,filter:RecordFilter):RulePreview`; `applyRulePreview(ctx:CommandContext,previewId:Id):RuleApplyResult`. Rule fields keywords/type/sources/priority/actions; actions category/labels/review marker, không amount/account/FX.

- [ ] Tests exports ID set = list cùng filter/ACL, string note bắt đầu `=,+,-,@` được escape khỏi spreadsheet formula; unicode/date/currency exact; stream lỗi không xuất file giả thành công.
- [ ] Rules mặc định chỉ nguồn `import`; nguồn `manual` chỉ áp dụng khi người dùng chọn rõ, không có tùy chọn `bank`. Test import khớp được đề xuất, manual bị bỏ qua theo mặc định và chỉ khớp khi bật nguồn manual. Khớp keyword normalize/case theo spec rule, ưu tiên số nhỏ hơn, stopOnMatch explicit; preserve manual overrides; dry-run không ghi, apply kiểm revision, rerun không nhân nhãn/audit vô hạn.
- [ ] Chạy `npm test -- server/wallet/exports.test.ts server/wallet/rules.test.ts`, xác nhận FAIL; implement deterministic rules + candidate preview hash; export stream có cancel.
- [ ] UI selection export đúng số, xác nhận summary; rule preview hiển thị before/after và số ảnh hưởng. Test/lint; kiểm tra so exported IDs với list và report drilldown.
- [ ] Commit `feat(wallet): add exports and previewed categorization rules`.

### Task 12: Lịch định kỳ, nhắc hạn và occurrence chống trùng

**Files:** Create `server/wallet/{schedules,jobs}.ts`, `schedules.test.ts`, `jobs.test.ts`, `src/features/wallet/Planning.tsx`; Modify recurring API/db/App wiring.

**Interfaces:** `generateOccurrences(schedule:Schedule,period:Period):OccurrenceDraft[]`; `confirmOccurrence(ctx:CommandContext,id:Id,input:{linkRecordId?:Id}):Occurrence`; `runDueJobs(now:string):Promise<JobRunResult>`; `startWalletJobs(deps):{stop:()=>Promise<void>}`. Schedule expense/income/transfer, weekly/monthly/yearly, manual/automatic, monthEndPolicy clamp/skip, timezone.

- [ ] Tests 31/1→28/2 năm2027 và29/2 năm2028 với clamp; skip giữ đúng policy; restart/multi-client chỉ1 record/occurrence; automatic chỉ ghi sổ theo dõi, không chuyển tiền thật.
- [ ] Link occurrence với record import có sẵn không tạo expense nữa; missed dates catch-up được giới hạn và báo; pause không xóa record cũ; reminders unique occurrence+offset+recipient và ACL. Chạy tests, xác nhận FAIL.
- [ ] Implement unique schedule+dueDate, worker lease, retry/backoff and durable job state; reuse push dispatch hiện có. Snapshot lưu schedule/occurrence/job policy; chỉ một scheduler instance sở hữu lease.
- [ ] UI upcoming/overdue/paid/skipped, choose manual/auto, preview next3 dates, nhắc trước3ngày và đúng hạn theo config. Chạy tests/lint.
- [ ] Commit `feat(wallet): add durable recurring records and due reminders`.

### Task 13: Nối nợ và goals vào sổ tài khoản

**Files:** Create `server/wallet/links.ts`, `links.test.ts`; Modify `server/db.ts`, legacy debt/goal routes, `src/components/DebtTracker.tsx`, `SavingsGoals.tsx`, types và Planning.

**Interfaces:** `recordDebtPayment(ctx:CommandContext,debtId:Id,input:{principal:Money;interest:Money;accountId:Id;recordId?:Id;date:string}):DebtPaymentLink`; `contributeGoal(ctx:CommandContext,goalId:Id,input:{money:Money;mode:'allocation'|'transfer';recordId?:Id;fromAccountId?:Id;toAccountId?:Id;date:string}):GoalContributionLink`; `unlinkFinancialLink(ctx:CommandContext,linkId:Id):void` với explicit keep/void record policy trong request.

- [ ] Borrowed principal giảm liability, không thành consumption expense; interest là expense; linked record không tạo lần2. Lent repayment giảm receivable, không income giả. Existing legacy_unlinked chỉ biểu diễn lịch sử cho đến khi user link.
- [ ] Goal allocation chỉ earmark, không tạo income/asset; transfer goal dùng transfer command; net worth trước/sau góp không tăng. Chặn allocation vượt nguồn khả dụng khi strict policy bật; contribution private theo quyền; void/payment edit cập nhật link và totals atomic.
- [ ] Chạy `npm test -- server/wallet/links.test.ts`, xác nhận FAIL; implement explicit linking, unique contribution/payment record links và rollback failure.
- [ ] UI chọn “liên kết bản ghi có sẵn” hoặc “ghi nhận mới”; preview ảnh hưởng balance/budget/debt/goal. Đối chiếu với utility debt hiện có và chạy toàn bộ test debt/goals liên quan, lint.
- [ ] Commit `feat(wallet): link debts and savings without duplicate cashflows`.

### Task 14: Ngân sách, carry-forward và dự báo

**Files:** Create `server/wallet/budgets.ts`, `budgets.test.ts`; Modify Finance/Planning, legacy budget routes, `financePeriod.ts` chỉ nếu cần policy; Create UI budget components trong feature.

**Interfaces:** `calculateBudget(actor:Actor,budget:WalletBudget,period:Period):BudgetReport`; `carryBudget(ctx:CommandContext,budgetId:Id,from:Period,to:Period):CarryResult`; `forecastBalance(actor:Actor,input:{accountIds:Id[];period:Period;scenario:'scheduledOnly'|'historicalAverage'}):ForecastReport`. Result actual/unpaidPlanned/estimatedOther/remaining/expectedBalance/method/sampleCount.

- [ ] Budget1m, actual600k, unpaid schedule250k → remaining400k, expected150k; paid linked schedule không tính nữa. Budget chồng danh mục không nhân tổng family expense; warning overlap và distinct total.
- [ ] Carry200k từ kỳ trước chỉ một lần, lần2 cùng output; negative carry default0. Forecast average không có history trả insufficient-data, không bịa số; month change/timezone và historical FX đúng.
- [ ] Chạy test file FAIL; implement actual report Task8, unpaid occurrences Task12, estimator 3 kỳ trước tách planned identifiable để không đếm hai lần. Alerts default80%/100%, gửi một lần mỗi threshold/period/recipient, reset chỉ qua revision có quy tắc.
- [ ] UI actual và forecast nhãn riêng, công thức/số kỳ mẫu; budget filter category/accounts/labels; carry policy. Verify tests/lint và existing carry-forward route behavior.
- [ ] Commit `feat(wallet): add filtered budgets and explainable forecasts`.

### Task 15: Portfolio, giao dịch đầu tư và market data

**Files:** Create `server/wallet/{investments,marketData}.ts`, `investments.test.ts`, `marketData.test.ts`, `src/features/wallet/Portfolio.tsx`; Modify Assets/types/report valuation.

**Interfaces:** `recordTrade(ctx:CommandContext,input:TradeDraft):Trade`; `valuePortfolio(actor:Actor,accountId:Id,asOf:string):PortfolioValuation`; `refreshQuotes(instrumentIds:Id[],date:string):Promise<QuoteRefreshResult>`; `MarketDataProvider.search(query,exchange):Promise<Instrument[]>`, `.quote(instrumentId,date):Promise<Quote|null>`. Buy/sell là ghi lịch sử theo dõi, không đặt lệnh thật.

- [ ] Buy10×100, phí10 → cash giảm1010 và cost basis1010; sell4×120 phí5 → proceeds475, cost404, realized71; remaining6 cost606; quote130 → unrealized174. Kiểm theo currency exponent, fractional quantities8digits và sale vượt holdings reject.
- [ ] Instrument cùng ticker khác sàn không gộp; missing quote/stale/holiday không dùng giá0; capital deposit không gắn là performance; assets liên kết portfolio không double net worth; editing historical trade recompute deterministic.
- [ ] Chạy test files FAIL; implement average cost, cash posting atomic, quote snapshot provenance và throttled cached provider. Bản đầu stock/ETF, giữ vàng/crypto/property của Assets; dividends/splits/corporate actions cần event model và fixture trước hỗ trợ live instrument có các sự kiện đó.
- [ ] UI account/instrument/exchange/quantity/date/price/total/fee, value/history/allocation/growth; hiển thị giá đóng cửa/ngày cập nhật và dữ liệu thiếu. Test/lint; không chọn nhà cung cấp production nếu chưa kiểm coverage/license/quota.
- [ ] Commit `feat(wallet): track investment trades and portfolio valuations`.

### Task 16: Settings, PWA, receipt và nâng cấp trải nghiệm

**Files:** Create `src/features/wallet/WalletSettings.tsx`, settings service/test; Modify i18n/resources, PWA/service worker hiện có, media/upload, Finance/Shopping integration chỉ khi nối receipt. Create `src/features/wallet/offline.ts`, `offline.test.ts` nếu bật offline writes.

**Interfaces:** `saveWalletSettings(ctx:CommandContext,input:WalletUserSettings):WalletUserSettings`; settings locale/defaultPeriod/hideDecimals/sessionIdleMinutes/theme inherited. `clearWalletDeviceCache():Promise<void>` xóa chỉ wallet cache, không toàn origin unrelated storage; `enqueueOfflineCommand(input:OfflineWalletCommand):Promise<Id>`, `replayOfflineCommands():Promise<ReplayResult>` chỉ enable sau conflict tests.

- [ ] Test locale date/number chỉ đổi display, không đổi tiền; auto logout5phút xóa wallet cache/token theo auth của repo; cache per-user không chéo login; offline read có stale badge.
- [ ] Receipt quyền/mime/size/path checks, HEIC flow hiện có vẫn hoạt động; OCR optional tạo draft không ghi tiền; warranty liên kết receipt + purchase date/period và reminder, không bắt buộc cho parity web. Shopping “đã mua” không tự ghi expense thêm nếu đã link.
- [ ] Chạy relevant tests FAIL; UI settings/account archive/hide balances/help; giữ light/dark, reduced motion, keyboard, phone/tablet; profile/billing/privacy dùng flow chủ sở hữu app, không clone nội dung BudgetBakers.
- [ ] Offline viết là nâng cấp tùy chọn: queue key+revision, logout flush policy, retry409 cần user resolve; chỉ bật khi test mất mạng/replay hai lần không trùng. Test/lint.
- [ ] Commit `feat(wallet): add localized settings and resilient device experience`.

### Task 17: Kiểm thử tích hợp, backup, hiệu năng và compatibility

**Files:** Create `tests/e2e/wallet.spec.ts`, `scripts/benchmark-wallet.ts`, `server/wallet/system.test.ts`, synthetic fixtures; Modify test config/package/Windows workflow; native dependencies phải có trong ZIP được F06 kiểm thử.

**Interfaces:** test harness `createWalletFixture(seed:number,records:number):WalletSnapshot`; `runWalletBenchmark(config:{records:number;iterations:number;outputPath:string}):BenchmarkReport`; report ghi machine/runtime/commit/p50/p95/RSS/import time/errors. Fixtures tuyệt đối không lấy từ tài khoản thật.

- [ ] System test migration2lần, legacy write+new write cùng totals, 2client conflict, transfer failure atomic, import retry, worker restart; backup khi write WAL, restore tiền/media/ACL/prefs/schedules/portfolio, old backup metadata và invalid backup không sửa DB.
- [ ] E2E Accounts→Records→Reports→Export→Import→Planning→Portfolio→Settings, cả light/dark, 390px/768px/desktop, keyboard, empty/error/loading; child/guest HTTP direct bị chặn; row selection >1page và report drilldown ID match. Kiểm không có màn hình kết nối ngân hàng/cấp token tích hợp/MCP; các route bị loại không được đăng ký trong router và không tham gia worker.
- [ ] Cài/browser E2E bằng registry chính thức theo dependency review; chạy `npm test`, `npm run lint`, `npm run build`, E2E runner đã chọn (ví dụ `npx playwright test tests/e2e/wallet.spec.ts` sau khi config/dependency tồn tại). Kỳ vọng exit0, ghi số tests và môi trường; không tuyên bố tests pass trước output.
- [ ] Benchmark100k records, page50 p95<500ms reference Windows CI, report tháng<1s, import10k responsive; ghi hardware/Node/dataset và đo VPS2019 riêng ở R02. Đây là targets chưa đo. Profile/query plan/index/stream trước đổi stack. Test Windows ZIP/service restart/DATA_DIR persistence/restore qua F06–F07, không Docker/ARM/Pi.
- [ ] Commit `test(wallet): cover migration permissions backups and finance workflows` cùng bằng chứng CI/benchmark đã redacted.

### Task 18: Hoàn tất parity audit và rollout

**Files:** Modify feature registry trong repo, `src/App.tsx`, release/version/docs chính thức; Create `docs/wallet/operations.md`, `docs/wallet/parity.md`.

**Interfaces:** rollout flag `walletV2` bằng mechanism feature settings hiện có; status `disabled|pilot|enabled`, canonicalStoreVersion=2. Không có two-write mode thiếu transaction consistency.

- [ ] Review các GAP còn áp dụng trong G01–G12 với tài khoản thử/dữ liệu giả; G10 và phần linked bank/rule bank-only ngoài phạm vi. Ghi UI/DOC/NEW/GAP từng feature và bằng chứng; các khoản không thể xác minh không tự chuyển sang UI verified. Corporate actions/nguồn giá thị trường/OCR chưa có đánh dấu partial rõ; các tính năng đã bỏ ghi excluded, không ghi pending hoặc provider-dependent.
- [ ] Pilot bản sao backup, so tổng theo tài khoản/currency/kỳ và phân loại khác biệt có giải thích; không lấy tổng old incompletely-linked goal/debt làm chuẩn net worth. Người dùng review migration report và số dư opening trước dùng chính thức.
- [ ] Lập rollback bảo toàn writes sau cutover: reverse projection các record representable hoặc export event delta; unsupported trade/transfer phải bảo toàn snapshot mới, không downgrade DB âm thầm. Thử rollback rehearsal rồi restore lại V2.
- [ ] Chạy lại checks Task17 khi có thay đổi trên Windows Actions; review diff không credential/fixture thật; bàn giao đúng SHA/artifact cho R01–R03. Publish/deploy/merge theo authorization, không tự deploy khi CI xanh.
- [ ] Commit `docs(wallet): document parity migration and staged rollout`; báo feature completed/partial/excluded, evidence checks và điều kiện còn thiếu trong phạm vi.

## 5. API nội bộ phục vụ giao diện

Tất cả routes dưới `/api/wallet` chỉ phục vụ frontend Family-Organizer; auth đăng nhập và role/account ACL Task4 áp cho mọi endpoint. Không thêm API công khai `/api/wallet/v1`, cấp token tích hợp hoặc công cụ cho ứng dụng bên ngoài; tên route không tạo thêm logic song song.

| Endpoint | Method | Contract domain |
|---|---|---|
| `/accounts`, `/accounts/:id` | GET/POST/PATCH | list/create/updateAccount; archive PATCH, xóa phải dùng policy riêng |
| `/accounts/:id/balance` | GET | book/available/asOf, không trộn presentation credit limit |
| `/records`, `/records/:id` | GET/POST/PATCH | listRecords/createRecord/updateRecord |
| `/records/:id/void` | POST | voidRecord có expectedRevision/idempotency |
| `/records/bulk`, `/selections` | POST | bulk preview selection snapshot và commit |
| `/records/:id/allocations` | PUT | setAllocations, không thêm posting |
| `/categories`, `/labels`, `/templates` | GET/POST/PATCH | catalog/templates; archive giữ lịch sử |
| `/reports` | POST (query only) | filter + metric + groupBy + granularity |
| `/preferences/:kind` | GET/PUT | owned versioned prefs |
| `/imports`, `/:id/preview`, `/:id/commit`, `/:id/undo` | POST | stage/preview/commit/undo |
| `/exports` | POST | selected IDs hoặc filter+selectionToken, trả streamed file |
| `/rules`, `/rules/preview`, `/rules/apply` | GET/POST/PATCH | deterministic rules dry-run+apply |
| `/schedules`, `/occurrences/:id/confirm` | GET/POST/PATCH | schedule CRUD và occurrence link/create |
| `/budgets`, `/budgets/:id/report`, `/budgets/:id/carry` | GET/POST/PATCH | budget/calculate/carry |
| `/debts/:id/payments`, `/goals/:id/contributions` | POST | financial link services |
| `/instruments/search`, `/trades`, `/portfolio/:id` | GET/POST | provider search, recordTrade, valuation |
| `/settings`, `/privacy/export` | GET/PUT/POST | user settings + authorized full user data export |

Privacy erase và account deletion có restore/cascade policy chưa quyết định từ khảo sát; không đặt endpoint DELETE destructive mặc định trong bản đầu. Void/archive là luồng an toàn đã đặc tả, privacy erase triển khai theo chính sách dữ liệu của chủ app sau khi thiết kế retention và phạm vi rõ.

## 6. Kịch bản nghiệm thu xuyên suốt

1. Tạo 3 account giả Cash VND, Bank VND, Saving USD; chọn opening; Bank là tài khoản theo dõi thủ công, bổ sung giao dịch bằng form hoặc nhập file, không có kết nối/sync.
2. Tạo income/expense/transfer fixture Task5; dashboard, balance detail, record list, export và report phải khớp cùng định nghĩa.
3. Split expense thành2danh mục; tổng balance/expense không tăng; thêm2labels không nhân total.
4. Mở2tab sửa cùng record; tab sau conflict và giữ draft, không overwrite silently.
5. Import file giả lần2: chỉ đề xuất duplicate, commit retry không nhân; undo giữ record sửa sau import nếu policy cho phép.
6. Tạo schedule ngày31; preview ngày cuối tháng; confirm/link existing record, restart worker không sinh thêm.
7. Trả nợ gốc+lãi, góp goal qua allocation/transfer, budget actual/forecast; từng bút toán có link và không double.
8. Mua/bán giả instrument cùng ticker khác exchange, stale quote, FX missing; portfolio/net worth trình bày coverage đúng.
9. Login member restricted và gọi URL/API nội bộ/export/media trực tiếp; chỉ visible account, child/guest bị403; grant read không được tạo/sửa record.
10. Backup/restore trên container clone; reload balances/media/prefs/occurrences và source mappings đúng; flag pilot bật rồi tắt không làm hỏng legacy modules.

## 7. Tự rà soát plan và bước tiếp theo

Coverage: dashboard9; accounts5–6; records5–7; filters6/8/9; analytics8–9; imports10; export/rules11; planning12–14; investments15; settings/receipts/offline16; migration/ACL/backup1–4/17; rollout18. Đồng bộ ngân hàng, REST API công khai, token có scope và MCP đã loại khỏi deliverables, dependencies, model và nghiệm thu. Các tính năng chưa có trên Wallet web được nhận diện là NEW trong spec, không gộp vào bằng chứng UI.

Task18 phải báo rõ GAP còn áp dụng; Task15 phải hiển thị trạng thái thiếu/stale giá nếu chưa có nguồn giá thị trường đáp ứng. Mỗi task có interfaces, files, behavioral tests, verification và commit; mở PR theo các đợt A–F để dễ review. Tiêu chí test là yêu cầu trong plan, chưa phải kết quả đã chạy.

Khi bắt đầu thực thi, đầu tiên checkout Family-Organizer vào workspace riêng, đọc AGENTS/CLAUDE đúng HEAD, xác nhận `.codegraph` có hay không (không tự index), chạy baseline tests, và điều chỉnh line/path theo source mới. Không cần clone repo hay tạo branch chỉ để đọc plan này.

Khuyến nghị bắt đầu đợt A và B: đây là phần quyết định tính đúng của mọi số liệu sau này. Chọn thực thi trực tiếp hoặc subagent-driven ở lượt triển khai sau khi bạn đã review tài liệu; phiên lập plan này chưa chọn phương thức hoặc triển khai code.
