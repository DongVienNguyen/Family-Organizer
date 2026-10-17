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
| Workflow and approval | Existing P10 completion/active transition/Review commands, adult rejection reason and exactly-once approval reward | Add pointer/touch Workflow drop routing through the same explicit confirmations; Review remains a derived target |
| Recurrence and rotation | Existing accepted completion/skip/edit/legacy conversion; ordered roster and bounded historical previews | Retain approval/proof/reward/successor and restore regressions at the final gate |
| Grouped drag interactions | Grouped menu moves and pure order confirmations exist | Pointer/touch group source/target identity, multi-tag projection deduplication and selected-dimension preview |
| Remaining board UX | Shared drawer, column scrolling/collapse, keyboard menus and pagination exist | Pin display, filtered-out feedback with explicit semantic return/undo, drag overlay/autoscroll, light/dark/reduced-motion and large-list checks |
| M1 qualification | Cloud regression reports are recorded by source checkpoint | Full current browser inventory across engines and required Windows2022 checks; applicable package/service evidence |

After M1 functional readiness, continue Wallet storage/authority/migration and
accounts/transactions/transfers/queries/reports/dashboard/import/export/rules in
master dependency order. Wallet contracts and the existing storage pilot do not
complete Wallet core. Later family planning, collaboration, Focus/Habit/dashboard,
integration and rollout milestones remain outstanding.

R02 requires separately authorized actual Windows Server2019 evidence. No release,
tag, VPS access or deployment is authorized by this checklist. The user's PC is
not a required build/test/database/CI runner.
