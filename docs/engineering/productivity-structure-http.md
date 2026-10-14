# Internal structure HTTP — P04-b1

The application session and shared request-ID/revision gateway own these routes.
They expose the accepted schema2 organization commands through Express, without
another database, token scheme, provider integration or automatic migration.
Supported schema1 startup remains unchanged; structure commands require explicit
schema2. Inactive storage returns409 after authentication, anonymous requests401.

| Route | Request / response |
| --- | --- |
| GET `/api/productivity/catalog` | Current actor's visible lists/sections/tags |
| GET `/api/productivity/roots` | Canonical root DTOs and unique count |
| POST `/api/productivity/lists`, `/sections`, `/tags` | `{expectedRevision,input}`; returned list/section/tag |
| POST `/api/productivity/lists/:id/grant` | `{expectedRevision,input:{userId,permission}}` |
| POST `/api/productivity/sections/:id/archive` | `{expectedRevision}` |
| POST `/api/productivity/tasks/:id/list` | `{expectedRevision,input:{listId,sectionId}}` |
| POST `/api/productivity/tasks/:id/parent` | `{expectedRevision,input:{parentId}}` |
| GET/POST `/api/productivity/tasks/:id/checklist` | POST `{expectedRevision,input:[{id?,text,done}]}`; checklist IDs/revision/progress |

The existing `x-request-id` identifies retries. Current actor/object management
rights precede cached command results; stale revisions return409, malformed
input400, invalid domain structure422, forbidden operation403 and hidden/missing
objects404. Task responses omit legacy JSON and storage rank. Checklist progress
never completes a task or grants rewards. Same-list section moves preserve links;
cross-list linked nodes require detachment. Archive retries preserve committed
results and recheck management rights.

Task changes invalidate affected descendants and their previous/current visible
audiences. List grants invalidate previous readers when access is revoked. Catalog
changes use `PRODUCTIVITY_CATALOG_UPDATE` only for permitted catalog readers,
including newly created lists and empty private lists. SSE sends only event type
and timestamp; it sends no entity ID, title, body, tag label or private count.
Failed commands send no invalidation. Repeated successful retries may invalidate
the authorized cache again, without repeating writes/rewards/notifications.

Synthetic HTTP tests cover current auth/ACL, roles, no-store DTOs, revision/retry,
checklist progress/server IDs, roots, cycle/foreign-section refusal, archived retry,
private labels and previous-reader/descendant/catalog audiences. The downloaded
compiled ZIP consumer must additionally prove structure routes, v1 refusal,
catalog retry, checklist/tree/section/archive behavior and invalid/stale refusal.
Existing compiled semantic/restart/snapshot/encrypted-recovery/DELETE-journal
refusal and closed-handle/offline assertions remain required.

This accepts internal routes only after exact-HEAD Windows evidence. Shared UI,
editor/cache, keyboard/phone acceptance and P04-a's three tag limitations remain
P04-b2-owned. FullP04/P05 remain incomplete. Production/default activation belongs
to P18; Windows2022 does not establish Server2019/R02. No release or VPS action.
