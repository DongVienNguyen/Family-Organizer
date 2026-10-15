# Matrix UI (P07)

The canonical task workspace adds Matrix beside List and the retained board. It
uses the existing internal session, full authorized task cache and shared task
drawer. A task keeps its ID and unsent drawer draft when its quadrant changes.
Legacy installations remain inactive until the separately reviewed rollout.

Create a private Matrix view, choose deadline/importance, priority-only or custom
rules, then save. Custom rules use typed conditions, AND/OR/NOT, ordered first
match, an unmatched tray and overlap diagnostics. Read-only rule preview queries
all pages with a captured server clock; it saves neither tasks nor view config.
A competing config write returns 409 and retains the local form until the user
explicitly reloads. Switching presets changes the view, not task attributes.

Move using the card's “Move to” menu or its separate drag handle. On touch,
press and hold the handle until activation, then drag. Opening a task or tapping
its checklist does not activate dragging. Every move opens confirmation showing
the captured target and before/after values. Deadline changes require a separate
checkbox. Custom choices require a new successful preview before Apply. A private
view pin leaves task attributes unchanged and has a visible reset action.

Cancel/Escape sends no apply. A stale revision keeps the original placement and
local draft; request a new preview before applying. An uncertain response keeps
the same explicit-retry packet and idempotency key. Authorization refresh hides
rows and dialogs while preserving local drafts; fresh server ACL checks remain
authoritative. No optimistic card move or completion/reward workflow is added.

The plus button proposes an editable, unsaved task draft. Cancel creates nothing;
only explicit submission creates the task through the existing command API.

P07 pins @dnd-kit/react 0.5.0 and its lockfile dependencies after checking official
registry peers (React 18/19) and the current DragDropProvider API. The existing
Windows packager retains these frontend build-input licenses. Backend/schema,
Node and SQLite runtime remain unchanged in this UI slice.

Verification uses synthetic fixtures and offline providers. The mandatory Windows
job runs the original 15 Productivity flows plus Matrix keyboard/pointer/editor/
conflict/choice flows in Chromium, Firefox and WebKit. An additional Chromium
mobile-emulation case dispatches trusted native CDP touch and verifies checklist
isolation, handle activation and cancellation. That case does not claim physical
phone or Firefox/WebKit touch acceptance. JSON, JUnit, traces, runtime identity,
viewport screenshots, cleanup and exit codes are retained and checked separately.
Cloud Chromium results are diagnostic; Windows2022 does not prove Server2019/R02.
