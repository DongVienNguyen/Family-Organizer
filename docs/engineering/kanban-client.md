# Validated internal Kanban reads (P09-a)

The existing Task API client exposes board(viewId, options) and
groupedBoard(viewId, options). These use the current private Bearer session,
no-store GET transport, encoded view/cursor/timezone and caller AbortSignal.
HTTP401/403/404/409/422 remain typed errors; there is no automatic retry, new
credential, public API, offline queue, mutation or optimistic lifecycle change.

Returned pages must match the view, have positive view/board/Task revisions,
valid clocks in the requested timezone and bounded columns/page/task/reference
counts. Canonical sections/workflow placement must agree with actual Task facts.
Unique column IDs/keys and Task IDs, total counts and complete/redacted WIP
contracts are checked. Private exact WIP counts cannot appear in a redacted DTO.
Those counts do not confer write or override authority.

Grouped pages carry each canonical Task body once plus scalar card references.
Each reference must name a returned Task and existing group, agree with actual
priority/assignee/due/tag facts, and have a distinct visual and semantic identity.
No embedded Task body or unused/duplicate canonical row is admitted. Multi-tag
cards can share one Task body and totalUnique remains unique Tasks. Partial
pages keep global counts and opaque cursors; truly empty boards have total0.
Positive totals with empty pages are refused, since the server emits a nonempty
valid cursor page or409. Unknown Task metadata is stripped by the shared Task
parser and returned records are detached from response objects.

One whole-branch SELF review graded two Important consistency findings before
one correction: positive-total empty pages and a mismatched requested timezone.
Four regression REDs cover both canonical and grouped responses, while genuine
empty0 boards remain valid. The positive explicit-UTC transport fixture now
returns UTC, preserving its path/abort assertions.

This is a client contract prerequisite. Rendering, board settings, drag/menu/
keyboard/touch interactions, page merging and mutation reconciliation are still
separate P09 work. Full P08/P09/P10 and the master plan are unfinished. No schema,
server writer, runtime activation, release/tag/VPS or Server2019/R02 acceptance.
