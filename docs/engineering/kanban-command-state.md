# Physical Kanban confirmation owner (P09-e)

This transient controller prepares the physical section/rank confirmation owner.
It is not mounted in the app. Grouped menus, drag, column settings and workflow
completion remain separate work. Selection must come from a validated current
canonical projection and the current saved view's rank-sort configuration; a
new actor/session owns a different controller.

Only a visible Task, existing section-board destination and visible destination
anchor can request a preview. Workflow and non-rank-sorted boards are refused.
The returned plan must still match current view/board/Task revisions and timezone.
No Task, board, lifecycle, reward or cached canonical record changes optimistically.

Explicit apply is singleflight. A lost response or HTTP5xx retains the same
private plan and UUID for an explicit user retry, without retrying automatically.
HTTP4xx retires that plan; fresh preview is required. Cancel cannot interrupt an
active apply, but authority clear, changed projection or disposal aborts the
request and suppresses every old-owner response/callback. An abort does not prove
a server transaction rolled back; the future mounted owner must perform a fresh
authorized read when authority returns.

An acknowledged apply retires the write identity before invoking the supplied
current-owner reread callback. A reread failure cannot offer a second write.
Generation/sequence checks occur again immediately before that callback, including
when a synchronous subscriber clears authority after the acknowledgement. Only
typed HTTP status and phase enter errors, never raw server text. Public plan
objects cannot mutate the separate private apply plan. No receipt seeds cache.

Synthetic deferred-promise regressions cover double apply, explicit UUID reuse,
HTTP refusals, actor/selection changes, stale revisions, cancel, dispose, late
receipts, private text removal and acknowledged-write/reread boundaries. One real
development regression failed20/21 before the pre-callback ownership recheck;
all assertions were retained. The initial missing-module run collected0tests and
is scaffold evidence only. Cold import remains storage/network free, and Windows
evidence rejects an omitted controller suite. Windows acceptance and actual
pointer/keyboard/touch UI behavior are not established by these controller tests.
