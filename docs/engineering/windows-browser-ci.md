# F05-a: production browser checks

The `Windows production browsers` job builds the existing production server/UI
on Windows2022 x64 with Node24.21.0, npm11.19.0, better-sqlite3 13.0.3 and
Playwright1.64.0. The Node22/24 quality matrix remains mandatory. `ci-gate`
requires both quality and browser results to equal `success`, including on
failure, cancellation and missing/skipped job results. No path filters or test
retries are configured.

Each of Chromium, Firefox and WebKit runs these same five first-attempt flows:

| Case | Observable behavior |
|---|---|
| B01 | Invalid login denied; valid Admin login, reload, finance access, logout and token revocation |
| B02 | Child finance deep link has no finance navigation/data; authenticated direct API returns403 |
| B03 | Child own/shared notes and media visible; other member's private media denied; actual image decodes; Guest sees only shared note |
| B04 | Active PWA worker; logout deletes seeded private CacheStorage/IndexedDB and private entries in the shell cache, preserves a public asset |
| B05 | Member's private note/media visible before logout; Child switch removes it and old member token is rejected |

`run-browser.mjs` owns a fresh synthetic four-role legacy fixture outside the
checkout, with Unicode/spaces in its path, absolute roots, a separately reserved
port and a foreign working directory. It runs `dist/server.cjs`, waits for
readiness, executes the actual Playwright CLI, records its native exit/signal,
stops the server through the existing stdin lifecycle, checks SQLite integrity,
closed connection and preserved user IDs/roles, and removes the fixture in
`finally`. The app receives a whitelist of necessary host environment variables;
no Actions/GitHub/provider credentials are inherited. The native addon hash is
taken from the actually loaded module, independent of prebuild/build layout.

Test-only preloads block all external fetch/HTTP destinations. The dashboard's
five existing weather/market GET sources receive deterministic local `Response`
fixtures; their requests are logged separately and never delivered. All other
destinations, including Telegram and AI, remain blocked. Browser routing allows
the app origin and fulfills declared Google font requests with offline empty CSS.
Unexpected external browser destinations and uncaught page errors fail tests.
The privacy tests retain service workers; they do not bypass PWA behavior.

PowerShell captures `$LASTEXITCODE` immediately after browser installation and
the Node runner, including commands piped to logs. JSON/JUnit/HTML, actual engine
versions and executable SHA256, source/lock/native/build hashes, process exits,
server/provider logs and failure trace/video/screenshots are uploaded with
`if: always()` and retention14 days. The machine gate rejects missing cases or
engines, empty reports, skips, retries, expected failures, aggregate disagreement,
wrong source/runtime/lock/native hashes and incomplete cleanup. Synthetic negative
evidence fixtures exercise this gate; they are not evidence of browser execution.

Playwright tests are excluded from Vitest discovery because this separate
mandatory job executes them with their own runner. The unit tests of browser
evidence/provider adapters remain required quality suites. No app behavior,
runtime dependency or existing assertion has been weakened.

This first browser matrix is not the full legacy CRUD/regression matrix. Coverage
LCOV and its ratchet belong to F05-b; all module mappings/performance/package/
service/restore checks remain F06–F09 work. Actual Server2019 acceptance remains
R02. The October12 GitHub ruleset and branch-protection writes still return403;
the user's Administration-write authorization has not changed the installation
permissions available to this environment. Main enforcement remains unaccepted.
No release/tag, VPS access or deployment is performed.
