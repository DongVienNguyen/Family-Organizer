# Personal settings and device experience — W16 core

Source `925009844e680a0c3333174d2f81272724786486` adds session-actor-owned settings, exact Money/date display,
number locale, inherited theme, default report period, balance/report masking,
decimal display and inactivity choices5/15/30/60 minutes (default5). The existing
auth boundary immediately clears local credentials/private views at expiry and
uses the existing best-effort server logout. Activity is observed by the current
browser tab; timers and listeners retire at the session boundary. Settings and
receipts do not grant financial authority or write money.

Only presentation rounds; stored minor strings and effective days remain exact.
An opened form keeps its captured input locale and exact precision. Monetary
confirmations retain exact amounts for review. A saved default period initializes
an untouched session and can explicitly reset filters; it cannot overwrite an
already viewed filter/draft. App theme remains shared.

Wallet balances/widgets wait for saved display policy before rendering. A
pending/unknown hide request tightens masking immediately; a request to reveal
cannot loosen saved masking before a confirmed fresh read. Unknown settings keep
one original payload/key across navigation; stale-client edits remain conflicts.
Settings are private to the actor, including from other Admin accounts.

Manual device cleanup deletes only Wallet-namespaced CacheStorage/IndexedDB.
It retains auth, server ledger, static assets and other family/application data.
Logout cleanup also recognizes these Wallet stores. There are no enabled cached
financial reads or offline financial writes. Existing receipt MIME/size/path/
permissions and HEIC conversion remain unchanged; OCR/warranty extras are optional.

Explicit storage16/standalone snapshot17 adds settings owner/config/revision/time,
with I01 audit, once-only receipt, current role checks and snapshot validation.
Accepted SQL1–15 and the production preparation/package cap remain unchanged.

## PDF Unicode behavior

The existing four bundled Roboto binaries and their original OFL notice remain
unchanged. Unicode cmap coverage is read from those actual bytes. Unsupported
characters appear as [U+XXXX] codepoints with an explicit PDF footer and export
UI notice, instead of silently becoming NUL glyphs. Vietnamese remains text;
CSV/XLSX preserve original CJK/emoji. This is a documented fallback, not full
CJK/emoji glyph coverage or a production font-provider claim.

## Development evidence

8391 tests/493 files, matching full JSON/JUnit, zero
failed/skipped/todo; all8350 W15 parent cases plus41 retained with
multiplicity. Lint/build exit0. Whole Wallet Chromium65/65 retains all56 W14
and four W15 focused identities, with five new W16 cases. No retries/skips/flaky
outcomes; fixture16 is offline, integrity OK, legacy retained, normal-stop,
closed/cleaned and exact source/build-bound. Light/dark phone viewport images
are retained. Earlier failed development reports remain available.

[Proof](evidence/w16-settings-development.json),
[JUnit](evidence/w16-final-full.junit.xml.gz),
[log](evidence/w16-final-full.log.gz). Author inspection is not independent review.
PR/CI run URLs:none; backup branch only. Windows2022/Node22/package/service/
other engines/touch and actual Server2019 R02 remain unrun. Next W17 performance/
recovery, W18 cutover and remaining Productivity/M1/I02/I03/master scope.
No release/tag/VPS access or deployment.
