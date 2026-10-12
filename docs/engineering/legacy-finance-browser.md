# F09-c — existing finance browser smoke

B07 extends the mandatory browser inventory to seven flows in Chromium, Firefox
and WebKit:21 first-attempt cases, zero retries/skips. It uses the existing synthetic
production fixture and offline provider/network boundary. No application UI or new
Wallet feature is introduced.

The flow creates a25000 expense through the real form, checks HTTP response/creator/
category/account/date and visible row/expense total, reloads and verifies persisted
bytes, edits to35000 with the same ID/creator/createdAt, verifies row/count/totals
and reload persistence, cancels deletion, confirms deletion and reloads. The final
finance rows equal the original synthetic rows; UI expense total returns to its
initial value. The existing child/role-switch privacy flows remain mandatory.

Gate REDs prove the old18-case policy did not require this finance flow; these are
policy regressions, not demonstrated historical UI defects. The confirmation test
uses the actual scoped dialog role plus visible heading and exact Vietnamese
cancel label; initial selector assumptions were corrected by source inspection.

Cloud1943 unit/integration tests105files,57 gate tests, lint/build0 are verified.
Playwright discovery enumerates21 cases and establishes configuration only.
Actual Windows browser execution, one review and final main rebase/exact CI remain
mandatory. Assets/debt/goals and other F09 matrix UI rows remain separate; this is
not complete financial UI or foundation acceptance. No release/tag/VPS operation.

One complete review found0Critical/1Important/2Minor. All were graded and
accepted before one correction pass. Cancellation now observes DELETE requests
from before the first dialog, requires none after cancellation, then checks the
full HTTP collection and reload before intentional deletion; final matching
DELETE count must be exactly one. Editing requires the full created transaction
with only amount changed, and whole collections after creation/edit/cancel.
The browser date is fixed safely inside a month before first navigation; timers
continue normally across reloads. These are characterization coverage fixes,
not demonstrated application defects. Actual21 Windows cases remain unrun.
