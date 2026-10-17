# M1 feature readiness checklist

Development sequence: the user requested main features and Cloud functional
checks first, then final Windows qualification. This checklist records usable
flows separately from the remaining approved work. It does not qualify M1,
Windows Server2019 or the complete master plan.

| Flow | Source implementation | Remaining acceptance |
| --- | --- | --- |
| Shared canonical Task drawer and Matrix | Existing shared drafts, rule editor, preview/apply, classification versus deadline changes, pins and touch | Retain regression coverage when finishing Kanban and at the final Windows gate |
| Kanban columns and shared WIP | Create/rename/order/archive preview; off/soft/hard WIP with whole-board counts | Final group verification, Windows and package checks |
| Board/view creation and quick-add | Atomic Section/Workflow view factory, editable Section/Todo draft, revision and UUID guards | Synchronous current-catalog authority now retires drafts before pin/view reads; keep revoke→restore regression at the final gate |
| Saved Kanban view preferences | Title, grouping, sort, query, priority and lifecycle drafts; explicit conflict rebase and unknown-result replay | Cloud corrected-source verification passed; final Windows remains; other stored filter fields are preserved |
| Manual ordering | Section and same-lane active Workflow ordering; pure grouped rank preserving timed deadlines and secondary tags | Cloud corrected-source verification passed; final Windows remains; noncustom sorts keep ordering disabled |
| Workflow and approval | Existing P10 completion/active transition/Review commands, adult rejection reason and exactly-once approval reward | Pointer Workflow drop now uses the same explicit P10 confirmations; dedicated new-kind touch and final qualification remain |
| Recurrence and rotation | Existing accepted completion/skip/edit/legacy conversion; ordered roster and bounded historical previews | Retain approval/proof/reward/successor and restore regressions at the final gate |
| Grouped drag interactions | Grouped menu moves and pure order confirmations exist | Pointer group source/target identity and selected-dimension preview now pass; dedicated new-kind touch remains |
| Remaining board UX | Shared drawer, column scrolling/collapse, keyboard menus and pagination exist | Overlay/default auto-scroll now pass native checks; pin display, filtered-out feedback with explicit semantic return/undo, full light/dark/reduced-motion and large-list qualification remain |
| M1 qualification | Cloud regression reports are recorded by source checkpoint | Full current browser inventory across engines and required Windows2022 checks; applicable package/service evidence |

Main M1 core flows are now developed and functionally checked in Cloud. Under the
user’s main-feature priority, continue Wallet storage/authority/migration and
accounts/transactions/transfers/queries/reports/dashboard/import/export/rules in
master dependency order while retaining every remaining M1 item above for full
acceptance. Wallet contracts and the existing storage pilot do not
complete Wallet core. Later family planning, collaboration, Focus/Habit/dashboard,
integration and rollout milestones remain outstanding.

R02 requires separately authorized actual Windows Server2019 evidence. No release,
tag, VPS access or deployment is authorized by this checklist. The user's PC is
not a required build/test/database/CI runner.
