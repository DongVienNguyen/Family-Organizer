# Kanban presentation and page snapshots (P09-b)

The presentational Kanban component consumes already-authorized and validated
canonical or grouped pages. It does not fetch, persist, mutate Tasks or establish
session authority. The future owner must clear stale actor/view state, coordinate
async reads and route open to the existing shared Task drawer.

Section columns are labelled classification, so a section named Done cannot
imply completion. Workflow labels reflect actual state; pending approval renders
Review with a clock, and only completed lifecycle has a completion mark. Cards
open the canonical Task ID even when multi-tag visual references appear twice.
There is no mutation checkbox or advertised drag interaction. WIP shows exact
counts only for complete visibility; redacted facts show the configured limit.
Missing member/tag names use an unavailable label rather than raw IDs.

Columns use bounded horizontal scrolling and native details/summary disclosure.
Theme-aware surfaces, visible focus and matching Vietnamese/English/Chinese
strings follow DESIGN.md. Loading/error feedback is inline; the owner can disable
opening/reloading/pagination while authorization is unresolved. SSR and direct
handler regressions do not prove native keyboard/touch, light/dark screenshots
or collapse interaction; actual UI browser integration is still pending.

Page append requires the expected opaque cursor and identical view/board IDs,
revisions, clock, totals and column/WIP metadata. It refuses duplicate canonical
cards, conflicting shared Task facts, duplicate visual/semantic tag references,
repeated current cursors, overflow and incomplete final coverage. Multiple tag
pages retain one canonical Task body. Inputs are detached; a refusal leaves the
previous snapshot intact. These helpers combine validated API pages and are not
another network or ACL boundary.

The component is not yet mounted in the application. App entry, async/session
coordination, actual synthetic9 browser fixture, settings, drag/menu moves and
large-list virtualization remain later P09 slices. Full P08/P09/P10/master work
is incomplete. No schema/default activation, release/tag/VPS or Server2019/R02
acceptance is claimed.
