# Productivity cho Family-Organizer Implementation Plan

**Repo thực thi duy nhất:** [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), branch `main`; branch/PR/CI thực hiện trong repo này theo master.

> **For agentic workers:** Thực thi từng task bằng Codex Cloud theo master/AGENTS; dùng Superpowers khi skill thực sự có trong environment. Checkboxes ghi việc có bằng chứng. P01–P18 thuộc plan này; W01–W18 thuộc Wallet, I01–I03 thuộc master, F/R thuộc plan Windows.

**Goal:** Nâng cấp task core, Eisenhower Matrix và Kanban của Family-Organizer, rồi bổ sung lịch, nhắc, notes, focus, habits và tổng kết gia đình dùng cùng dữ liệu.

**Architecture:** Frontend `src/features/productivity`, domain/SQL `server/productivity` trong repo hiện có. List/Matrix/Kanban/Calendar là projections của task canonical; role/list/task ACL ở server. Semantic commands cập nhật task/reward/occurrence/outbox nguyên tử qua gateway I01, adapter giữ `/api/tasks` và các luồng trẻ báo xong/người lớn duyệt.

**Tech Stack:** React19/TS5.8/Vite6/Tailwind4/Motion/Lucide/i18next; Express4/SQLite/Vitest/PWA. Node24 LTS x64/better-sqlite3 tương thích pin qua F01; Windows Service/ZIP/PowerShell theo [plan Windows](2026-10-11-windows-native-foundation.md). DnD chọn `@dnd-kit/react`, kiểm peer và pin ở P07; không trộn legacy `DndContext` với `DragDropProvider`. Calendar grid/SVG React. [React quickstart](https://dndkit.com/react/quickstart/).

**Spec:** [Khảo sát và thiết kế TickTick](../specs/2026-10-11-ticktick-productivity-design.md).

**Điều phối:** [Plan cuối cùng](2026-10-11-family-organizer-upgrade-master.md) là entry point: F01–F09 +I01 nền Windows trước, rồi P/W, cuối cùng R01–R03. Thực thi trên Codex Cloud/Windows Actions, không PC cá nhân. Đây là plan, chưa có code/tests pass. Paths là điểm thay đổi trong checkout Family-Organizer.

## Global Constraints

- Không REST API công khai, token tích hợp có scope, MCP hoặc đồng bộ ngân hàng. API nội bộ dùng auth hiện có.
- Một task ID dùng chung mọi view; overdue là predicate, không lifecycle; pending approval không completed.
- Timezone `Asia/Saigon` mặc định; due tagged none/all_day/timed, scheduledStart/end không phải deadline. Filter `[from,toExclusive)`.
- `high|medium` important mặc định; urgency horizon=1 ngày; rule AST≤32 điều kiện/depth≤4; subtask depth≤5.
- Custom Matrix first-match theo thứ tự ô, có unmatched tray và overlap diagnostics; không chạy expression JavaScript người dùng.
- Drag có preview nếu đổi deadline/quyền/nhiều thuộc tính; conflicts409 không overwrite; Section Done không tự complete.
- Child/guest có task theo ACL, không có tài chính. Approval/reward/rotation hiện có phải được giữ qua characterization tests.
- Mọi write có request UUID, payload hash, expected revisions; task/reward/occurrence/outbox chung write transaction I01.
- ACL áp cho list/direct task/search/count/export/media/SSE/push; client filters không là security boundary.
- Rank integer gap1024, rebalance trong transaction; hard WIP kiểm toàn board, không theo filter cá nhân.
- Backups Wallet+productivity+legacy+media cùng manifest/version; no dual-write hoặc ledger điểm canonical thứ hai.
- Giữ UI styles/i18n/PWA; runtime Windows-native, CI windows-2022 và nghiệm thu Server2019 ở R02; fixtures synthetic; native/mobile/Premium hoặc T01–T12 chưa kiểm chứng ghi trạng thái đúng.

## Review Focus

1. Legacy overdue và date string không timezone: map có báo cáo, không bịa workflow/ngày; tests P01/P02.
2. Drag đổi deadline hoặc ambiguous custom rule: preview/cancel, pin badge, reject invalid target; tests P06/P07.
3. Hai user vượt hard WIP hoặc hai tab đổi order: commit một lần,409/422 và không mất card; tests P08/P09.
4. Child forged reward/status/approval và retry approve/reopen: không bypass duyệt/nhân điểm/successor; tests P03/P10.
5. Private parent/subtask/cross-list/SSE/media/report/cache: không rò nội dung/count, restore không gửi lại push; tests P03/P12/P17/P18.

## 1. Lộ trình và file map

| Đợt | Tasks | Deliverable | Ước lượng ngày công* |
|---|---|---|---|
| A | P01–P05 | Canonical tasks, migration, quyền, drawer, smart views | 12–20 |
| B | P06–P07 | Matrix engine + rule editor + preview drag | 6–10 |
| C | P08–P09 | Kanban sections/workflow/grouping + WIP + DnD | 6–10 |
| D | P10–P13 | Reward/recurrence, calendar, notifications, notes/import | 12–20 |
| E | P14–P16 | Focus, habits/countdowns, review/analytics | 9–16 |
| F | P17–P18 | Accessibility/PWA/settings, system/backup/performance/rollout | 7–12 |

*52–88 ngày công là baseline lịch sử riêng productivity, chưa gồm Windows; hiệu chỉnh sau F01/F09, trừ nền shared. Không phải deadline. Matrix/Kanban cần P01–P10, accessibility P17/tests P18 sau nền Windows; không chờ Focus/Habit.

Dependency: I01→P01→P02→P03→P04→P05; P05→P06→P07; P03/P05→P08→P09; P02/P03/P04→P10; P05/P10→P11/P12; P04/P05→P13; P03/P10→P14/P15; P05/P08/P14/P15→P16; các UI áp P17 xuyên suốt; cuối cùng P18. **Chưa bật workflow completion mới nếu P10 chưa đạt nghiệm thu.**

| Vùng | Files mới | Trách nhiệm |
|---|---|---|
| Shared | `src/features/productivity/{contracts,dates,filters}.ts` | DTO và pure clock/filter logic |
| Store | `server/productivity/{schema,store,migrate,snapshot,legacy}.ts` | SQL, cutover, backup/compatibility |
| Task domain | `server/productivity/{access,tasks,structure,query,views}.ts` | ACL, commands, tree và query |
| Matrix | `server/productivity/matrix.ts`; `src/features/productivity/{Matrix,MatrixEditor,MovePreview}.tsx` | Classifier/inverse move và UI |
| Board | `server/productivity/{board,rank}.ts`; `src/features/productivity/{Kanban,BoardColumn,TaskCard,BoardSettings}.tsx` | Sections/transition/WIP/order |
| Lifecycle | `server/productivity/{completion,recurrence,jobs,notifications}.ts` | Approval/reward/occurrences/outbox |
| Calendar | `server/productivity/calendar.ts`; `src/features/productivity/{Calendar,Timeline}.tsx` | Task+FamilyPlan projection |
| Extra | `server/productivity/{content,imports,exports,focus,habits,countdowns,insights,settings}.ts` | Notes, data tools và tracker |
| Shell | `src/features/productivity/{api,useTasks,offline,drag}.ts`; `Productivity.tsx`, `TaskDrawer.tsx`, `ListView.tsx`, `ViewPicker.tsx`, `SmartViews.tsx`, `Focus.tsx`, `Habits.tsx`, `Review.tsx`, `Settings.tsx` | Một cache/draft và nhiều view |
| Router | `server/productivity/router.ts` | API nội bộ authenticated |

Modify paths có thật: `src/components/{Tasks,Schedules,Notes,Dashboard,GlobalSearch,Assistant,Settings,PushNotificationsCard}.tsx`, `src/App.tsx`, `src/types.ts`, `src/utils/recurrence.ts`, `server.ts`, `server/db.ts`, `server/sqlite.ts`, i18n resources theo cây repo. Tests đặt cạnh domain `*.test.ts`, routes `*.api.test.ts`, E2E `tests/e2e/productivity.spec.ts`. I01 sở hữu shared gateway/snapshot, không để mỗi module tạo migration runner hay auth riêng.

## 2. Contracts

P01 export từ `contracts.ts`; DTO domain hoàn thiện trong task sở hữu nhưng các trường dưới đây không đổi semantics:

```ts
type Id = string;
type Revision = number;
type AppActor = {userId: Id; role: 'admin'|'member'|'child'|'guest'};
type AppCommand = {actor: AppActor; requestId: Id; expectedRevision: Revision};
type Lifecycle = 'todo'|'in_progress'|'completed'|'wont_do';
type Priority = 'high'|'medium'|'low'|'none';
type Due = {kind:'none'} | {kind:'all_day'; date:string; timezone:string}
  | {kind:'timed'; instantUtc:string; timezone:string};
type QueryClock = {nowUtc:string; timezone:string};
type TaskFilter = {query?:string; listIds?:Id[]; sectionIds?:Id[]; tagIds?:Id[];
  tagMatch?:'any'|'all'; assigneeIds?:Id[]; priority?:Priority[];
  lifecycle?:Lifecycle[]; overdue?:boolean; rootsOnly:boolean;
  dueRange?:{from:string; toExclusive:string}; includeTrash?:boolean};
type Page<T> = {items:T[]; nextCursor:string|null; totalUnique:number};
type Quadrant = 'q1'|'q2'|'q3'|'q4';
type RuleNode = {op:'and'|'or'; args:RuleNode[]} | {op:'not'; arg:RuleNode}
  | {op:'test'; field:'list'|'section'|'tag'|'assignee'|'priority'|'lifecycle'|'due';
     operator:'in'|'any'|'all'|'window'; value:string[]|{fromDay:number;toDayExclusive:number}};
type TaskRecord = {id:Id; listId:Id; sectionId:Id|null; parentId:Id|null;
  title:string; body:string; lifecycle:Lifecycle; priority:Priority; due:Due;
  scheduledStart:string|null; scheduledEnd:string|null; creatorId:Id; assigneeId:Id|null;
  isShared:boolean; tagIds:Id[]; blocked:boolean; blockedReason:string|null;
  pendingApproval:boolean; rewardPoints:number; revision:Revision; deletedAt:string|null};
type TaskPatch = Partial<Pick<TaskRecord,'title'|'body'|'priority'|'due'|'scheduledStart'
  |'scheduledEnd'|'assigneeId'|'blocked'|'blockedReason'|'tagIds'>>;
type TaskView = {id:Id; ownerId:Id; revision:Revision; filter:TaskFilter;
  kind:'list'|'matrix'|'kanban'|'calendar'|'timeline'; config:ViewConfig};
```

`ViewConfig` discriminated union định nghĩa ở P01: list(sort/group), matrix(preset/horizonDays/quadrant rules/order/showCompleted), kanban(mode/group/sort/columns), calendar(range/style). Runtime schema reject invalid cross-kind config; title≤500 chars, body≤100k chars, page limit≤100. `TaskRecord` mở rộng legacy audit/proof/timestamps ở P02, không drop chúng khi serialize. `AppCommand` dùng revisions của aggregate task; lệnh board/view dùng thêm expectedBoard/ViewRevision.

Result/error contract: `{code,message,fields?,requestId}`, 400 invalid syntax,401 no login,403 forbidden operation,404 hidden/missing,409 revision mismatch,422 semantic/limit failure. Mutation request UUID unique(actor,command,requestId), hash payload; retry trả result cũ, cùng ID payload khác→409. Opaque selection IDs/preview IDs là references tới snapshot thuộc actor, không phải token cấp quyền.

## 3. Tasks

### Task P01: Model, clock và hợp đồng

**Files:** Create shared contracts/dates/filters, `dates.test.ts`, `filters.test.ts`; Modify types theo adapter; consume I01 actor/transaction ports.

**Interfaces:** `resolveDue(due:Due,clock:QueryClock):{overdue:boolean;localDate:string|null}`; `matchesFilter(task:TaskRecord,filter:TaskFilter,clock:QueryClock):boolean`; `parseLegacyDue(raw:string,timezone:string):{due:Due;warnings:string[]}`. Pure functions không đọc Date.now hoặc quyền ngầm.

- [ ] Viết `all_day_local_midnight`: ngày11/10/2026 hết hạn ở 2026-10-11T17:00:00Z tại Saigon, không ở 00:00Z; due none không overdue. `legacy_ambiguous_date` reject ngày01/02 không format, giữ raw trong report; `period_end_exclusive` loại đúng record ở biên cuối.
- [ ] Viết filter OR-within/AND-between, tags any/all, root-only và completed overdue=false; chạy `npm test -- src/features/productivity/dates.test.ts src/features/productivity/filters.test.ts`, phải FAIL trước implement.
- [ ] Implement tagged schemas và clock helpers; terminal lifecycle không overdue; dates giải DST bằng timezone-aware adapter kiểm đúng nguồn trước chọn dependency, không host-local Date.parse.
- [ ] Chạy hai test files và `npm run lint`, kỳ vọng exit0; assert syntax/timezone invalid không thành ngày hợp lệ.
- [ ] Commit `feat(productivity): define task view and clock contracts`.

### Task P02: SQLite, migration và compatibility

**Files:** Create schema/store/migrate/snapshot/legacy và `migration.test.ts`, `store.test.ts`; Modify server/db/sqlite/App task serialization; reuse I01 migrations/snapshot writer.

**Interfaces:** `migrateTasks(tx:AppWriteTx,legacy:LegacyTask[]):MigrationReport`; `loadTask(tx,id):TaskRecord|null`; `toLegacyTask(task:TaskRecord):LegacyTask`; `exportProductivitySnapshot(tx):ProductivitySnapshot`. `AppWriteTx` do I01 export, không mở connection riêng.

- [ ] Fixtures IDs/comments/proof/points/sourceRecurringTaskId giữ nguyên; overdue thiếu history→todo+warning, history xác nhận doing→in_progress; priority low/medium/high giữ nguyên, none chỉ cho mới; due string giữ raw/timezone assumption. Migration2lần không thêm task/tag/list.
- [ ] Test legacy save title không xóa section/parent/Matrix pin; snapshot restore có rank/ACL/occurrences; rollback lỗi giữa rows không partial. Chạy `npm test -- server/productivity/migration.test.ts server/productivity/store.test.ts` FAIL.
- [ ] Implement tables prefix, FKs/indexes/list default, migration version/checksum/report, canonical cutover; existing reward JSON adapter cùng gateway I01, không shadow ledger. `/api/tasks` adapter đọc store mới; disabled/pilot dùng snapshot thử, không two-write.
- [ ] Test/lint; diff manifest và restore roundtrip trên temporary SQLite, không dữ liệu live.
- [ ] Commit `feat(productivity): migrate tasks into canonical sqlite store`.

### Task P03: ACL và commands task

**Files:** Create access/tasks/router và `access.api.test.ts`, `tasks.test.ts`; Modify legacy task routes/media/broadcast wiring.

**Interfaces:** `canReadTask(actor:AppActor,task:TaskRecord):boolean`; `assertTaskCommand(actor,id,operation):void`; `createTask(ctx:AppCommand,input:CreateTaskInput):TaskRecord`; `updateTask(ctx:AppCommand,id:Id,patch:TaskPatch):TaskRecord`. Completion dùng P10, không nằm trong generic TaskPatch.

- [ ] Test guest/child direct private GET404; shared read được nhưng edit task không own/assigned403. Forged creator/reward/pendingApproval/comments patch bị reject; member read grant không write; private child task không leak qua count/media/export/list/search.
- [ ] Test body with unsafe Markdown/HTML không executable; payload revisions cũ409; immutable createdAt/creator không đổi. Chạy `npm test -- server/productivity/access.api.test.ts server/productivity/tasks.test.ts` FAIL.
- [ ] Implement role+list/task ACL **trước query**, field whitelist, valid assignee/visibility, ownership; media authorized endpoint, no public proof URL mới. Normalize API errors; payload/proof không vào logs.
- [ ] Chạy tests/lint; compatibility existing tasks UI read/edit vẫn hoạt động với server filtering.
- [ ] Commit `feat(productivity): enforce task permissions and semantic writes`.

### Task P04: Lists, sections, tags, tree và task drawer

**Files:** Create structure domain/test, `Productivity.tsx`, `TaskDrawer.tsx`, `ListView.tsx`, `api.ts`, `useTasks.ts`; Modify Tasks/App/i18n/Notes entry links.

**Interfaces:** `saveList(ctx,input):TaskList`; `moveTaskToList(ctx,id,targetListId,sectionId):TaskRecord`; `setTaskParent(ctx,id,parentId):TaskRecord`; `setChecklist(ctx,id,items:CheckItemInput[]):TaskRecord`; `TaskDrawer({taskId,onClose})`; `useTasks(viewId):TaskViewState`.

- [ ] Test section phải cùng list, private child không rộng hơn parent, cycle A→B→A422/depth6 reject; archive section đưa task sang Not Sectioned và giữ task IDs; count task roots không nhân subtask. Checklist4items/1done→25%, không complete task.
- [ ] Chạy `npm test -- server/productivity/structure.test.ts` FAIL; implement catalog/tree/check-items and revision; complete parent có open subtasks mặc định bị chặn, không tự thưởng toàn tree.
- [ ] UI drawer dùng cùng cache/editor mọi view; priority none, due nullable, assignee/tag/pin/blocked, descriptions/checklist/subtask controls. New subtask reward mặc định0. Preserve approval/proof/history trong drawer; semantic buttons gọi P10.
- [ ] Test/lint và synthetic keyboard/phone; form dirty cancel giữ draft, đổi view không clone task.
- [ ] Commit `feat(productivity): add organized lists and shared task drawer`.

### Task P05: Query, smart/saved views và search

**Files:** Create query/views + `query.test.ts`, `views.api.test.ts`; Create ViewPicker/SmartViews; Modify GlobalSearch and SSE invalidation.

**Interfaces:** `queryTasks(actor,filter:TaskFilter,clock:QueryClock,cursor:string|null):Page<TaskRecord>`; `saveView(ctx,view:TaskView):TaskView`; `selectTaskIds(actor,filter,clock):SelectionSnapshot`; default views Today/Next7/Assigned/Overdue/Completed/WontDo/Trash.

- [ ] Fixtures tags2 không duplicate, accented Vietnamese search khớp cả có/không dấu; due no date nằm Inbox không Today; completed limit7/30/90/all đúng; private hits/count bị loại ở SQL. Selection >1page uniqueIDs, snapshot TTL15phút, stale writes reject.
- [ ] Chạy `npm test -- server/productivity/query.test.ts server/productivity/views.api.test.ts` FAIL; implement stable cursor sort+id, typed saved config/ACL, index and fulltext adapter; query clock cố định từng request.
- [ ] UI viewpicker/sidebar/search có empty/loading/error/reset; drilldown dùng cùng filter IDs; tagMatch any/all hiển thị rõ.
- [ ] Test/lint; compare IDs từ list/selection/report trên synthetic set.
- [ ] Commit `feat(productivity): add smart views and consistent task search`.

### Task P06: Matrix classifier và inverse move

**Files:** Create matrix.ts, `matrix.test.ts`, `matrix.api.test.ts`; add matrix_rules/overrides/pins migrations qua P02.

**Interfaces:** `classifyMatrix(actor,tasks:TaskRecord[],view:TaskView,clock:QueryClock):MatrixProjection`; `previewMatrixMove(actor,taskId,viewId,target:Quadrant,mode:'attributes'|'view_pin'):MatrixMovePlan`; `applyMatrixMove(ctx,previewId:Id,expectedViewRevision:Revision):TaskRecord`. Plan chứa target/patch/warnings/clock/expiry/config revision; preview TTL5phút.

- [ ] At Saigon11/10: high due12/10→Q1; medium due20/10→Q2; low due10/10→Q3; none/noDate→Q4. Tại midnight13/10, high due14/10 từ Q2→Q1. Priority-only high→Q1 không phụ thuộc due. Completed loại mặc định, all-day/timezone boundary đúng.
- [ ] Test overlap matches2→first-match+diagnostic, unmatched tray; rules>32/depth5 reject; actor không quyền không thấy task. Preview custom-rule không đảo được trả needsChoice, pin chỉ view; stale task/config/clock khi qua biên ngày yêu cầu re-preview, không apply sai target. Chạy hai matrix test files FAIL.
- [ ] Implement AST interpreter typed; inverse patch với clear warnings; server tính lại target lúc apply; pin keyed view/config revision, expired pin không apply. Đổi preset không mutate task attributes.
- [ ] Run tests/lint; mutation audit ghi field delta, config/pins restore roundtrip.
- [ ] Commit `feat(productivity): implement transparent matrix rules and moves`.

### Task P07: Matrix UI và DnD preview

**Files:** Create Matrix/MatrixEditor/MovePreview, drag.ts và `matrix-ui.test.tsx`; Modify package/lock at implementation, task shell/i18n.

**Interfaces:** `Matrix({viewId})`, `MatrixEditor({viewId,onSaved})`, `MovePreview({plan,onApply,onCancel})`; `requestDragMove({taskId,viewId,target,mode}):Promise<MatrixMovePlan>`. Uses P06 exact ports; drag.ts encapsulates current library event→domain intent.

- [ ] UI tests cancel preview=0mutations; attributes mode shows due before/after; pin shows badge/reset and leaves deadline unchanged;409 restores original position and keeps draft. Keyboard move menu yields same intent as pointer.
- [ ] Run UI test FAIL; add `@dnd-kit/react` locked compatible version from official registry after peer check; use current docs/DragDropProvider, no legacy DndContext snippet. Matrix2×2 desktop/stacked mobile, collapsing date groups, counts/overlap/unmatched, rule preview and preset selection.
- [ ] Pointer/touch activation prevents checkbox click from starting drag; live announcements; Escape cancel; no silent deadline writes. Empty quadrant quick-add creates editable draft with proposed attributes, not saved before review.
- [ ] Test/lint and browser 390px/768px/desktop, dark/light, reduced motion, keyboard-only; screenshots only synthetic, no live tasks.
- [ ] Commit `feat(productivity): add accessible eisenhower matrix experience`.

### Task P08: Kanban domain, rank và WIP

**Files:** Create board/rank plus `board.test.ts`, `board.api.test.ts`; extend views/store columns/positions.

**Interfaces:** `projectBoard(actor,viewId,clock):BoardProjection`; `previewBoardMove(actor,taskId,viewId,targetColumnId,beforeTaskId):BoardMovePlan`; `applyBoardMove(ctx,previewId,expectedBoardRevision):BoardMoveResult`; `setBoardColumns(ctx,viewId,columns:BoardColumnInput[]):TaskView`. Result has actualTask/actualColumn/approvalNeeded, not optimistic guessed done.

- [ ] Section “Done” move keeps lifecycle todo. Workflow drop Done dispatches P10; child result may be Review; Review is derived/read-only target. Date/priority/assignee/tag group patch only selected dimension; created/modified/overdue groups nonwritable; multi-tag bulk dedupe.
- [ ] Hard WIP2 with current2 blocks next422; two concurrent entrants when current1 allow exactly1, remaining409/422; filtered board still counts all active roots. Read-only limited user does not receive hidden exact private count. Rebalance gapless rank stable/atomic; stale board revision409.
- [ ] Chạy `npm test -- server/productivity/board.test.ts server/productivity/board.api.test.ts` FAIL; implement integer1024 rank, transition intents, source/destination ACL, section archive preview and WIP scope. WIP override admin requires reason/audit.
- [ ] Tests/lint; transaction failure after position update rolls back task+position; no worker side effect before commit.
- [ ] Commit `feat(productivity): implement transactional kanban moves and wip limits`.

### Task P09: Kanban UI, grouping và reusable drag

**Files:** Create Kanban/BoardColumn/TaskCard/BoardSettings, `kanban-ui.test.tsx`; Modify existing Tasks Kanban shell and drag.ts shared.

**Interfaces:** `Kanban({viewId})`, `TaskCard({taskId,projectionId,onOpen})`; `BoardSettings({viewId})`; consume P08/P10, cùng TaskDrawer P04.

- [ ] Tests Section board icon “phân loại” versus Workflow badge; WIP pending response blocks duplicate optimistic move; child drop Done shows “Chờ duyệt”, no done/checkmark. Manual reordering disabled when sort≠custom; filtered-out task after move gives toast+undo semantic link.
- [ ] Run UI test FAIL; implement custom/date/tag/priority/assignee grouping, collapse/column counts/quick-add, menu move, pinned cards, auto-scroll, drag overlay. Create/rename/order/archive columns có preview; built-in Not Sectioned không destructive delete.
- [ ] Pending Review reject opens reason form; approve requires role; inline completion buttons call same P10 command. Tag projections unique visual IDs but same taskId; no duplicated mutation.
- [ ] Test/lint/browser pointer/touch/keyboard, column scrolling/virtualized large list; restore old four-column view choice as legacy preset if needed.
- [ ] Commit `feat(productivity): upgrade family kanban interactions and grouping`.

### Task P10: Completion, approval, recurrence và rotation

**Files:** Create completion/recurrence/jobs và `completion.test.ts`, `recurrence.test.ts`, `completion.api.test.ts`; Modify FamilyDB save/approve/reject/reward writers, legacy routes, shared worker.

**Interfaces:** `requestCompletion(ctx,taskId,proof?:TaskProof):CompletionResult`; `approveCompletion(ctx,taskId):CompletionResult`; `rejectCompletion(ctx,taskId,reason):TaskRecord`; `reopenTask(ctx,taskId):TaskRecord`; `previewOccurrences(actor,seriesId,range):OccurrencePreview[]`; `editSeries(ctx,seriesId,scope:'this'|'future'|'all',patch):SeriesEditResult`; `skipOccurrence(ctx,occurrenceId):SkipResult`.

- [ ] Characterization tests pin current gate actorChild+recipientChild+points>0+points>threshold; threshold5 fixture reward10 child→pending/0points, adult approve→10points/successor1; adult completion follows existing policy. Invalid reward/assignee forgery403. Repeated approve same/newrequest can't add points twice; reopen creates one compensating reversal; repeated reject no negative points.
- [ ] Due-base weekly completion late keeps anchor cadence; completion-base uses acceptedCompletedAt; specific dates sort/unique; Jan31 clamp→Feb28(2027)/29(2028), skip policy different explicit result. Preview future virtual doesn't persist; pending approval doesn't rotate/create accepted successor; skip no points/no rotation. Edit-one exception preserves series/history.
- [ ] Chạy three test files FAIL; implement task/reward JSON adapter/claim/occurrence/outbox trong I01 transaction; all legacy completion paths dispatch ports, no direct generic completed patch. Recurrence end/count/missed policy validated; scheduler restart no duplicate materialization.
- [ ] Run tests/lint; characterization policy differences must be documented for user review before pilot. Pending task/proof and histories preserved in migration/restore.
- [ ] Commit `feat(productivity): preserve approval rewards and durable recurring tasks`.

### Task P11: Calendar/Timeline và FamilyPlan

**Files:** Create calendar.ts/test and Calendar/Timeline; Modify Schedules.tsx, recurrence utils, internal ICS download/export adapters.

**Interfaces:** `getCalendar(actor,range,clock):CalendarItem[]`; items typed task/virtualOccurrence/familyPlan/habit/countdown; `previewReschedule(actor,itemId,start,end,scope):ReschedulePlan`; `applyReschedule(ctx,previewId):CalendarItem`. Deadline changes optional explicit, scheduled interval alone doesn't change due.

- [ ] Test all-day date stays11/10 after render timezone; task+FamilyPlan overlap visible, not duplication; Q2 timebox keeps deadline; moving virtual recurring cycle creates one exception; end before start422; DST ambiguous slot asks choice. Private items excluded including titles/counts.
- [ ] Run calendar.test.ts FAIL; implement month/week/agenda and simple Timeline SVG/grid using same query/filter; range cap366days, occurrences max1000 per request. Preserve existing FamilyPlan route policy via authorized adapters, no independent duplicate calendar store.
- [ ] UI drag/resize uses preview and P10 scope one/future/all; filter/colors, future cycles badge, keyboard reschedule; ICS import/download authenticated file only, no new public credential/feed service.
- [ ] Test/lint and date/recurrence/ICS existing tests; confirm no financial event title leakage in I02 integration.
- [ ] Commit `feat(productivity): unify family schedules and task calendars`.

### Task P12: Notifications, collaboration và activity

**Files:** Create notifications.ts/tests; Modify existing SSE/broadcast, web-push, task comments/share controls, PushNotificationsCard.

**Interfaces:** `dispatchOutboxBatch(limit:number):Promise<DispatchResult>`; `scheduleTaskReminder(tx,taskId,recipientId,fireAt):void`; `saveListGrant(ctx,listId,memberId,permission:'read'|'contribute'|'manage'):TaskList`; `addTaskComment(ctx,taskId,content):TaskComment`; `getActivities(actor,taskId,cursor):Page<TaskActivity>`.

- [ ] Tests reminder unique(task,occurrence,recipient,kind,fireAt), worker retry/restart emits one delivery claim; access revoked before send suppresses body. SSE only invalidate accessible IDs, private title never on global event; comments cannot bypass task edit guard; no child permission grants.
- [ ] Run notification/API tests FAIL; implement transactional outbox with retry/backoff, per-user quiet hours/daily digest prefs, cancel/reschedule after task update. Delivery external push is retryable, not promised exactly-once receipt; inbox dedupe stableID.
- [ ] UI assignee/mentions/comment/history and share existing family members; no external invite service in MVP. Activity immutable; restore pause jobs and mark old notifications consumed, not send backlog.
- [ ] Test/lint and synthetic notification permission-denied/offline; existing notification infrastructure compatibility.
- [ ] Commit `feat(productivity): add permission-aware collaboration and reminders`.

### Task P13: Notes, templates, files và import/export

**Files:** Create content/imports/exports and tests, templates UI/import preview; Modify Notes/Markdown/media/GlobalSearch; reuse Wallet CSV parsing only after W10 exists, fallback local CSV adapter same contract.

**Interfaces:** `saveTaskTemplate(ctx,taskId):TaskTemplate`; `instantiateTemplate(ctx,templateId,targetListId):TaskRecord`; `convertTaskNote(ctx,id,target:'task'|'note'):ConversionResult`; `stageTaskImport(actor,file):TaskImportPreview`; `commitTaskImport(ctx,previewId):ImportResult`; `undoTaskImport(ctx,batchId):UndoResult`; `exportTasks(actor,selection,format:'json'|'csv'|'ics'):ExportStream`.

- [ ] Tests template produces new IDs/check items, not reward grant or copied completedAt; conversion retains content/history/link and doesn't auto-reverse points; reject conversion active rewarded/recurring task until explicit archive policy. Notes visibility checked on both ends; attachment MIME/20MiB/path traversal checks.
- [ ] JSON/CSV import file≤20MiB/10k rows, validate dates/list mapping/tree/depth; dry-run no writes, commit retry unique, undo only unchanged created objects; exporting text starting=,+,-,@ escapes formula. Cross-list private links exports only authorized refs.
- [ ] Run three test files FAIL; implement staged file parser, errors/report/undo and actor-owned previews; no OAuth importer/Notion/email/chat connector implementation. Legacy Notes APIs stay canonical with typed task links, not duplicated Markdown stores.
- [ ] Test/lint; open synthetic export then import roundtrip fields/IDs relationships; plaintext lossless JSON is backup-friendly format, ICS unsupported recurrence preserved as warning rather than silently approximated.
- [ ] Commit `feat(productivity): add reusable content and safe task data tools`.

### Task P14: Focus/Pomodoro/stopwatch

**Files:** Create focus.ts/test/api.test, Focus.tsx, focus settings; add session/segments schema and worker end event.

**Interfaces:** `startFocus(ctx,input:{targetType:'task'|'habit'|'none';targetId:Id|null;mode:'pomo'|'stopwatch'}):FocusSession`; `pauseFocus(ctx,id):FocusSession`; `resumeFocus(ctx,id):FocusSession`; `finishFocus(ctx,id):FocusSession`; `editFocusDuration(ctx,id,seconds,reason):FocusSession`.

- [ ] Test one-active/user two tabs→one winner; default25min focus/5min short break/15min long break after4; pause60s not counted; refresh/browser sleep derives from persisted timestamps, not setInterval tick count; retryfinish gives one log. Completing focus doesn't complete or reward task.
- [ ] Run focus tests FAIL; implement server session state/version, phase/pause segments and total active seconds; stopwatch cap24h per session, edited duration0..86400 with audit. Timer display clock offset handles server response, not client clock authority.
- [ ] UI task drawer/card/startFocus, task/habit link, notes, estimates, extra time/manual record; restore session after reload, report no inflated elapsed after pause.
- [ ] Test/lint/device sleep/wake + offline read, pending target visibility revoked redacts link; notifications reuse P12.
- [ ] Commit `feat(productivity): add durable task-linked focus sessions`.

### Task P15: Habits và countdowns

**Files:** Create habits/countdowns and test/API files; Create Habits and countdown editor; connect Calendar/Focus/Dashboard via typed refs.

**Interfaces:** `saveHabit(ctx,input:HabitDraft):Habit`; `logHabit(ctx,id,date:string,value:number,status:'done'|'skip'):HabitLog`; `habitStats(actor,id,range):HabitStats`; `saveCountdown(ctx,input:CountdownDraft):Countdown`; `countdownDays(countdown,clock):number`.

- [ ] Fixtures selectedMon/Wed/Fri skipsTue in scheduled denominator; n-times/week3 achieved2 gives2/3, not2/7; boolean goal1 or numeric goal20, partial progress capped display but stored value exact; unique(habit,date) retries update revision not duplicate. Skip not done, streak policy explicit and archive preserves history.
- [ ] Countdown local today0 or inclusive1 per setting; leapday annual clamp/skip stored; anniversary past shows elapsed, no negative countdown wording; log timezone change doesn't move historical dates. Run tests FAIL.
- [ ] Implement persisted frequency/goal/logs, heatmap and selected/n-times streak definitions; reminders no phantom task/reward creation. Children track allowed own/shared habits, adults review visibility; no automatic reward linkage default.
- [ ] UI check-in/edit/backfill/skip/archive, goals and weekly summary; calendar optional layer; tests/lint and mobile-friendly controls.
- [ ] Commit `feat(productivity): add habits and important-date tracking`.

### Task P16: Insights và weekly review gia đình

**Files:** Create insights.ts/test, Review.tsx; Modify Dashboard/GlobalSearch typed summary joins.

**Interfaces:** `getProductivityInsights(actor,range):InsightsReport`; `getFamilyWorkload(actor,range):WorkloadReport`; `saveReviewNote(ctx,range,content):ReviewNote`. Counters follow unique root task IDs by default; breakdown has coverage/denominators.

- [ ] Fixtures completed2/active3/wontdo1: throughput2, wontdo separate; reopened task terminal completion episodes explicitly counted, not duplicate rows. Cycle time=sum doneAt-startedAt per accepted completed episode, omit missing starts; lead time=acceptedDoneAt-createdAt. Review pending not throughput.
- [ ] Q2 focus share uses quadrant snapshot at focus-session start, not current priorities; no focus data→insufficient-data. WIP/blocked aging exact UTC durations, overdue local policy; hidden personal tasks and counts redacted, not “anonymous” leaking small groups. Run insights.test.ts FAIL.
- [ ] Implement events-based metrics+historical snapshot, missing-data badges; due effort estimates separate from raw card count; load summaries not automatic performance scores or reward allocation.
- [ ] UI weekly planning (Q2 timebox, blocked reasons, unassigned, overdue, family responsibilities), export only authorized summary; test/lint with empty history.
- [ ] Commit `feat(productivity): add explainable family planning insights`.

### Task P17: UX, preferences, PWA và optional smart capture

**Files:** Create settings/offline services tests, Settings.tsx; Modify App/Settings/Assistant/PWA/i18n/search and drag keyboard adapter.

**Interfaces:** `saveProductivitySettings(ctx,settings):ProductivityUserSettings`; `clearProductivityDeviceCache():Promise<void>`; `parseTaskDraft(text:string,clock:QueryClock):ParsedDraft`; `enqueueProductivityCommand(command):Promise<Id>` only when optional offline writes enabled.

- [ ] Tests cache per-user/logout clear, shortcuts ignored when editing text, no-date default doesn't silently become Today; Monday/24h/vi-VN display only; theme/reduced motion retain repo system. Keyboard-only Matrix/Kanban/task drawer reachable with labels/live announcements and Move menu.
- [ ] Run settings/UI tests FAIL; implement feature visibility/default priority/date/reminder/week start, saved layouts; smart Vietnamese parser recognizes “mai 8h #nhà”, shows extracted draft and uncertainty, user confirms before write; keep literal text toggle.
- [ ] AI optional uses Assistant existing configured provider only for draft/summary; untrusted task content cannot execute tools. No public REST/MCP integration, no transcript upload/background automatic task creation.
- [ ] Optional offline writes only after replay two times=one effect and409 keeps draft; **disable offline approvals/rewards/series edits/hard-WIP shared moves**, require online validation. PWA read cache stale badge; tests/lint responsive390/768/desktop/light/dark.
- [ ] Commit `feat(productivity): polish accessible and localized planning experience`.

### Task P18: System verification, migration pilot và rollout

**Files:** Create `server/productivity/system.test.ts`, `tests/e2e/productivity.spec.ts`, `scripts/benchmark-productivity.ts`, `docs/productivity/{operations,parity,migration}.md`; Modify test/workflow/version integration with master I03.

**Interfaces:** `createProductivityFixture(seed:number,active:number,historical:number):ProductivitySnapshot`; `runProductivityBenchmark(config):BenchmarkReport`; rollout `productivityV2=disabled|pilot|enabled` via repo flags, canonicalVersion tracked in shared manifest.

- [ ] Integration tests child approval/rollback/rotation/idempotency; concurrent WIP; clock midnight+DST; legacy task mutation adapter; backup while SQLite WAL writes→restore all task/reward/proof/view/positions/occurrences; invalid snapshot no DB changes, restore no push or points replay.
- [ ] E2E one synthetic ID List→Matrix→Kanban→Calendar→drawer; previewcancel no change; Section Done independent completed; Done child→Review→approved points1event; phone/keyboard/two tabs/filter drilldown/noDate/private/media/SSE; fixture skipped/finished instances correct.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, configured E2E e.g. `npx playwright test tests/e2e/productivity.spec.ts` after dependency/config exists. Record test counts/runtime/commit, exit0; commands here are requirements, chưa chạy.
- [ ] Benchmark10kactive/100khistorical page50 p95<500ms reference Windows CI, Matrix<1s, move commit p95<500ms; ghi hardware/RSS/Node/dataset, đo VPS2019 riêng ở R02. Fix SQL/query plan/virtualization trước đổi stack; Windows ZIP/service restart/DATA_DIR restore theo F06–F07. Đây là targets, chưa phải số đã đo.
- [ ] Pilot disposable snapshot; compare legacy task/reward totals and explain differences; T01–T12 marked UI/DOC/NEW/GAP/excluded. Rollback preserves delta/new fields through snapshot/export, never silent downgrade. Commit `test(productivity): verify matrix kanban rewards and recovery`; release/deploy only at authorized implementation stage.

## 4. API nội bộ và acceptance

Routes dưới `/api/productivity`, auth actor+ACL cho mọi route; không cấp API tokens hoặc public versions. Adapter `/api/tasks` giữ compatibility nhưng không nhận arbitrary persisted fields. Commands complete/approve/reject không dùng generic PATCH.

| Endpoint | Method | Port |
|---|---|---|
| `/lists`, `/sections`, `/tags` | GET/POST/PATCH | structure + grants |
| `/tasks`, `/tasks/:id` | GET/POST/PATCH | query/create/update |
| `/tasks/:id/{complete,approve,reject,reopen,archive}` | POST | semantic lifecycle commands |
| `/tasks/:id/{parent,checklist,comments,attachments}` | POST/PUT/GET | structure/content/media ACL |
| `/views`, `/views/:id` | GET/POST/PATCH | saved config |
| `/matrix/:viewId`, `/matrix/moves/{preview,apply}` | GET/POST | P06 projection/command |
| `/boards/:viewId`, `/boards/moves/{preview,apply}` | GET/POST | P08 projection/command |
| `/series`, `/series/:id/preview`, `/occurrences/:id/skip` | POST/GET | P10 |
| `/calendar`, `/calendar/reschedule/{preview,apply}` | GET/POST | P11 |
| `/focus`, `/habits`, `/habit-logs`, `/countdowns`, `/insights` | GET/POST/PATCH | P14–P16 |
| `/imports`, `/imports/:id/{commit,undo}`, `/exports`, `/settings` | POST/GET/PUT | P13/P17 |

Nghiệm thu tối thiểu Matrix/Kanban: shared canonical ID; classify default/custom/pinned/unmatched; clock reclassification; previewdeadline/cancel/conflict; section-versus-workflow; group edit/readonly dimensions; concurrent order/WIP; reward gate and recurrence preservation; server ACL+keyboard/mobile+backup. Focus/habit/native features không được dùng để trì hoãn mốc này.

Coverage tự rà: T01–T02/P06–P07; T03–T04/P08–P09; T05/T12/P01–P03/P10/P18; T06/P11; T07/P14–P16; T08/P13; T09/P03/P12; T10 deferred/excluded; T11/P17 optional. Task types, ports, field names và test ownership ở trên là thiết kế; khi bắt đầu phải đọc AGENTS/CLAUDE đúng HEAD, chạy baseline tests và cập nhật exact paths từ source mới. Không tự index CodeGraph, không clone/build app trong phiên viết plan này.
