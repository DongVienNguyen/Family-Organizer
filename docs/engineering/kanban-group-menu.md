# Kanban grouped move menu

Adults can open **Change group** beside an authorized canonical Task projection.
The menu uses the existing internal grouped preview/apply commands and shared
Task drawer. It changes only priority, assignee, due date or tag membership.
Completion, approval, reward, scheduled time and unrelated Task fields remain
unchanged. Workflow completion and pointer/touch dragging are separate work.

Field-only moves work under non-rank sorting. This menu does not pass rank
anchors or optimistically update Task/cache facts. The existing API-bound
confirmation owner binds visible Task/source projection, current revisions,
selected timezone, private preview and caller-owned command identity. Target or
tag-scope changes require a new preview. Authorization refresh or a changed
projection retires old work; accepted writes trigger an authorized refresh.

For multi-tag Tasks, the default changes only the selected source tag and keeps
other tags. Adding to or replacing all tags requires an explicit scope choice.
A no-tag target that would leave another tag is rejected rather than silently
clearing it; clearing every tag requires **Replace all tags**. Moving due groups
explicitly converts the deadline to an all-day date in the selected timezone,
or clears the deadline. The dialog discloses that conversion before preview.

The dialog uses FancySelect and useModalA11y, translated vi/en/zh labels,
keyboard preview/cancel/apply, Escape/focus restoration and a bounded mobile
date control. Grouped controls are separate siblings of canonical drawer
buttons; each visual tag projection retains its distinct source and shared
Task ID. Children and guests retain the read-only presentation.

Development evidence preserves the actual failures rather than retrying an
unchanged source: an ambiguous new selector, a same-view reselection that
cleared the board without rerunning its load effect, an incorrect ordering
assumption for unordered tag UUIDs, and a native driver response-body read
after the click's automatic waiting. The same-view fix returns before clearing
the controller when the selected ID is unchanged. Response observation starts
body parsing when the native HTTP response arrives; it does not replace the
response or issue another mutation. Assertions for HTTP status, exact canonical
fields, tag set/cardinality, revision, fresh API state and dialog closure remain.

The original 23 browser case bodies, offline boundary, zero-retry policy and
deadlines remain. Three new cases run on each engine: source-tag cancel/apply
with retained draft; priority/assignee/explicit due field-only moves under
title sorting; and explicit all-tags add/replace. The current inventory is
78 Productivity +45 legacy +1 native-touch first attempts. Historical 57/63/69
case profiles remain valid only for their own source inventories. Raw reports
include six new light/phone-dark group screenshots, all three original
producers and pinned Playwright blobs, alongside the existing images and
native/offline/cleanup evidence.

Full Cloud and exact-HEAD Windows acceptance are recorded separately in
implementation-status.md. Cloud Chromium diagnostics do not establish
Firefox/WebKit, Windows or Windows Server2019 acceptance. P08/P09/P10 and the
master plan remain incomplete; no release, tag or VPS operation is performed.
