# Legacy object visibility (F04-d)

Authoritative server policy now filters list responses, search before matching/limits, and assistant context before mapping/slicing. Realtime uses the same helpers. A client-side filter is never the authorization boundary.

| Domain | Admin | Member | Child/Guest |
|---|---|---|---|
| Tasks | Family tasks | Family tasks | Shared, created or assigned |
| Notes/plans | Shared or private | Shared or created | Shared or created |
| Documents | Shared, created or owned | Shared, created or owned | Role denied |
| Health/medications | Family care | Family care | Own patient |
| Finance | Family finance | Family finance | Role denied |
| Notifications | Own/all recipients | Own/all recipients | Own/all recipients |

Sharing means boolean true, never a truthy string. Unknown roles fail closed in these predicates. Lists/search contain no invisible object IDs or snippets. Search slices authorized matches; inaccessible rows do not consume its six-result limit. Assistant context omits finance for limited roles, filters schedules/tasks/patients, and rechecks the live session after SDK loading and after provider response. Tests mock the provider; no live key or outbound delivery is used.

Invisible and missing task comments/updates, note updates/deletes, plan updates/deletes, document updates/deletes and notification reads use the same404 within each route. No writer is called for a denied object. Task editing preserves adult management and child creator/assignee rights; Guests remain read-only for editing but may comment on visible tasks as the existing UI permits. Notes still require authorship or an explicit edit-role grant after visibility; Admin read/delete authority does not silently grant note editing. Whitelisted payload/field/approval hardening remains the subsequent input slice.

Health UI receives all patient choices for adults and only the current patient for limited roles, preserving useful own-record selection when the server filters care records. Actual App JSX/source tests cover this wiring; real browser acceptance remains F05.

The existing family calendar credential has no actor identity. Its subscription now contains truly shared plans plus family birthdays. Actor-specific private plans remain in the authenticated UI/export; no new scoped integration token is introduced. Recurrence/timezone/ICS formatting assertions remain.

Compiled production proof logs in as synthetic adult/child, checks private/shared lists, own health, direct finance denial, search filtering and shared calendar, alongside existing startup/native/cache/realtime probes. Evidence requires the objectAclHttp suite and object-visibility proof; missing evidence fails.

Scope limits: media ownership/authenticated rendering, schema/field/proxy/bootstrap policy, reward and notification content derived from private tasks, backup/log redaction, dependency triage and real browser/PWA gates remain required before fullF04/Internet acceptance. Family user projection remains available for assignment/contact/birthday UI without password hashes. No dependency/lock change, release/tag, VPS access/deployment or Server2019 claim.
