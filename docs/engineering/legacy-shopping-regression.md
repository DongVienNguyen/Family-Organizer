# F09-a — shopping and meal planning regression

This focused slice preserves the existing shared shopping list and offline meal
planner. It is one row of the required legacy matrix, not full F09 acceptance.
No Matrix/Kanban/Wallet features, provider calls or UI redesign are introduced.

Two synthetic regressions found real defects: same-millisecond shopping commands
collided on the SQLite primary key, and a numeric item name raised HTTP500 before
normal error handling. New items retain `shop_` and the timestamp with a UUID
suffix; existing IDs are retained. Name validation now rejects the numeric input
with HTTP400 without changing data. No dependency/runtime/lockfile change.

| Requirement | Owner/evidence |
| --- | --- |
| Distinct concurrent-time item IDs, edit/purchased attribution, clear purchased and remaining items | `server/shoppingPersistence.test.ts`; real SQLite, all fields asserted |
| Learned dishes retained, stable seed top-up, complete meal plan/groceries/household metadata retained | Same suite; independent readonly SQLite connection checks persisted JSON |
| All four authenticated roles use the shared list; malformed payloads leave data unchanged | `server/shoppingHttp.test.ts`; real HTTP with native SQLite/auth and synthetic users |
| Offline random saved plan, preview leaves saved plan unchanged, zero household refuses | Same HTTP suite; no AI/provider transport |
| Add, mark purchased, generate offline menu, reload and retain, clear through confirmation | Required `B06 shopping and offline meal persistence` in Chromium/Firefox/WebKit |
| Missing required source/browser suite, skipped/retried browser or contradictory JSON/JUnit | CI evidence gates; all earlier required assertions retained |

The browser matrix grows from15 to18 required first-attempt cases. Counts come
from the explicitly declared six flows and three engines; missing flows remain
fatal. The new browser flow is **not yet executed** until exact-HEAD Windows CI.

Initial fixture calls to `sqliteClose()` then reusing the same imported singleton
were invalid: the runtime intentionally keeps a closed owner closed. Those fixture
failures are not application defects. Corrected tests open independent readonly
connections and close them in `finally`; actual same-millisecond collision remains
RED before the source fix. Existing runtime/native service tests separately prove
restart and shutdown behavior.

Remaining F09 rows, Caddy compatibility, F08 authenticated collection, F05 GitHub
enforcement and actual Server2019 acceptance still gate full foundation acceptance.
