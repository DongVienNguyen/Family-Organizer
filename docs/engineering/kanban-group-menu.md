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

## Native response observation after the first Windows checkpoint

The first Windows run at `3fd0489` failed Chromium C25 with a CDP
`Network.getResponseBody` error. Both native apply requests returned200 in the
same frame; the application then read catalog/tasks through its authorized
refresh. The trace contains only the initial document load. Reading earlier in
the driver did not resolve the boundary. Firefox26 and legacy45 passed; Chromium
25 passed/1driver error, with no touch or WebKit aggregate run. Raw reports and
all114logs remain failure evidence.

A diagnostic clone observer then failed all three new cases with native
AbortError after HTTP200: an additional stream can outlive the application's
completed read and be cancelled when its owner refreshes. Those23pass/3error
Cloud reports are retained separately; they do not qualify the source.

The three new cases now observe the application's own original native
Response.json consumption. The wrapper invokes that original JSON method,
returns the original parsed value unchanged to the application, and copies only
the observed value for test assertions. The original fetch request/input/init,
signal and Response object remain. There is no second response stream, test body
read, fulfilled route, fabricated response, delayed apply, mutation or retry.
Driver HTTP200 remains required and its request UUID must match the native
capture. Native HTTP200, authenticated/no-store/signal metadata, exactly one
request and one native JSON read, Task ID and exact revision delta are
additionally asserted. Every original canonical field, tag cardinality, draft,
cancellation and fresh API-state assertion stays. The wrapper restores fetch in
finally; native/JSON errors fail the test.

The native-read observer also exposed an application AbortError, rather than
merely a driver-cache failure. A targeted C25 diagnostic captured the actual
AbortController stack at Kanban command-owner Object.dispose, called during UI
cleanup while its mutation body was pending. The diagnostic's single failed
case is separate from the required full26-case inventory.

Disposal now immediately retires generation, private plan/UUID, listeners and
callbacks while allowing an already dispatched mutation's bounded,
session-guarded response to drain. It does not send another mutation or retain
Task/cache authority. Preview disposal and explicit clear/selection changes
still abort. Session revocation continues to abort transport and reject body
consumption, independently of a disposed UI. Three native-body regressions
initially failed with44old cases passing, then passed with all old assertions
retained. The original23browser-case prefix remains byte-identical.

This production lifecycle correction changes the controller and its tests as
well as the diagnostic helper. It requires fresh full Cloud tests/lint/build,
26+touch browser evidence, one new source-scoped review and exact-HEAD Windows
acceptance; earlier full or partial results cannot qualify the new source.
