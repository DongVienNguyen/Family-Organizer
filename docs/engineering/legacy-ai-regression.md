# F09-h — existing AI HTTP regression with an offline SDK

`server/legacyAiHttp.test.ts` exercises actual Express, native SQLite and native
session authentication. A hoisted complete `@google/genai` mock captures constructor
options and generation requests; keys and results are synthetic. The suite setup
rejects unexpected external fetches. Jobs are not started and no notifications or
real AI requests are sent. The HTTP client has an absolute five-second watchdog,
handles response errors/aborts, and clears the watchdog when its owned request
closes; the fixture closes the server, drains handlers and disposes the app.

| Existing behavior | Regression evidence |
| --- | --- |
| Authentication, blank message, missing configuration | HTTP401/400, no SDK construction/generation, unchanged legacy snapshot |
| Shopping action drafts | Normalized reply/title/items, duplicate removal,20-item bound, unsupported transaction action omitted, no automatic legacy writes |
| Unstructured response | Original plain answer and empty actions preserved |
| Provider timeout error | Explicit mocked ETIMEDOUT rejection yields500 and one dispatch; no live timing/network or SDK timeout guarantee |
| Note Markdown draft | Guest403/blank400 before dispatch; headings/newlines/checklists/table preserved; empty result502; no note saved |
| AI configuration | Admin-only GET/POST, masked status, validation failure retains old synthetic key, successful synthetic validation saves, clear removes |

Equality through `sqliteLoad()` covers the complete legacy collection/singleton
snapshot, including notes, tasks, shopping and finance. It does not assert that
native session or command tables are immutable. AI-setting changes are checked
explicitly through the settings API and `getAppSettings()`.

Six characterization tests initially passed; no new app defect or behavior change
is claimed. One missing-suite regression failed before making this suite mandatory
in quality evidence. Existing `objectAclHttp.test.ts` separately covers provider
context ACL, session/context changes during await and authorized overload retry.

Assistant browser loading/error/close controls, note UI integration and module
flag-off behavior remain F09 work. No new provider, cancellation, API or token
feature is added. Full F09, Server2019, release/tag and VPS acceptance are absent.
