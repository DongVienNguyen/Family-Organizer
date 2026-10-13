# F09-g — existing calendar HTTP and ICS regression

`server/legacyCalendarHttp.test.ts` uses actual Express routes, native SQLite,
NativeSessionStore/auth and the existing ICS builder. Storage, users, subscription
secret and events are disposable synthetic fixtures. Jobs are not started, and
no notifications, AI requests or external calendar subscriptions are delivered.
The HTTP fixture has a five-second deadline and closes its server, drains handlers
and disposes the app; the suite setup closes SQLite and removes owned storage.

| Existing behavior | Evidence |
| --- | --- |
| Weekly recurrence weekdays, no end date, Unicode title/description, shared/private fields | Create as child; exact response/read/stored rows; owner edit and delete |
| Existing identity and supplied creation timestamp during ordinary edits | Edit compares ID/createdAt to the created record; this is not adversarial timestamp immutability |
| Malformed weekdays | HTTP400 and unchanged complete SQLite state |
| Private/shared actor visibility | Admin/owner see both; child/guest see shared only |
| Write authority | Hidden child edit/delete404, visible nonowner403, guest create403, unauthenticated read401; complete state unchanged |
| Admin editing another member's private event | Existing creator/privacy remain; full stored plan list matches |
| Existing shared family ICS subscription | Authenticated feed-info; synthetic existing token; content/cache/download headers, CRLF, timezone, weekly rule/UNTIL/one-hour occurrence and text escaping |
| ICS private exclusion and token rejection | Only one shared VEVENT; missing/invalid/array token401; no stored-state mutation |

The required-suite gate checks actual Vitest JSON participation and JUnit presence;
independent Windows acceptance parses JSON and all JUnit cases. The new missing-suite
regression first failed before adding the mandatory suite. Existing `icsFeed.test.ts`
and recurrence utility tests cover daily/monthly/yearly rules, malformed dates and
shared-only feed generation. These are helper tests, not HTTP tests for every rule.

Browser calendar rendering/edit flows, import behavior and module flag-off behavior
remain separate F09 work. This PR adds no calendar feature, API or token scheme,
and does not establish full F09 or Windows Server2019 acceptance.
