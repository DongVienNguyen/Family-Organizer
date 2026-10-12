# Weekly digest privacy (F04-l)

The existing weekly Telegram digest read raw legacy data before aggregation,
including another account's private documents, and could send captured data or
keys after permissions/settings changed while AI was pending. Existing settings
coerced malformed values and acknowledged swallowed write failures. This focused
change retains weekly/manual digests, Gemini fallback and durable occurrence
fencing without a new public/integration API or delivery provider.

Admin saving the bot/chat or weekly toggle becomes the explicit digest owner.
The UI explains that the operator must select authorized chat recipients. Telegram
membership is not inferred or verified; this is an operator-controlled routing
boundary, not proof that every chat participant has the owner's application role.
Old unbound configurations require Admin resave. Backup-only enable toggles retain
the existing digest owner. Body-supplied owner/unknown/malformed/oversize fields
are refused before any change. Validated settings+owner use one atomic existing
settings-file replacement with existing snapshot read/durableWrite helpers; failed
save returns503 and preserves the previous file. No second engine or SQLite store.

Before counts/top-five, the current active Admin owner filters tasks/plans/docs
using existing object visibility. Existing finance/birthdays/Admin plan overrides
remain. An internal manual requester must be the bound owner and keep a current
session. Current actor role/password/deletion, owner, enable state, bot/chat/key
and the complete derived visible payload are checked before AI dispatch (including
after module import) and again before Telegram. Stale work is a known failure,
without recording lastSent; unknown Telegram outcomes keep existing no-auto-replay
fencing. Hidden rows never enter prompts, summaries or transport.

Gemini uses an owned15second abort/deadline, HTTP timeout,700 output-token budget,
real SDK text property and4096-character escaped-text limit; unavailable/invalid
AI uses the same filtered fallback. Provider errors have constant logs/responses.
Long legacy fallback is shortened as entity-safe plain HTML text without changing
canonical data; short formatting stays. Category lookup/map handle unsafe own keys
and escape category markup. Only explicit offline mocks/preloads run in tests;
all other production-probe network requests remain blocked.

Observed43 unique RED contract cases include one newly-required owner binding;
five initial valid characterizations remain. The HTTP draft incorrectly replaced
a dependency after routes captured it; corrected fixture reran RED before source
changes and is the only counted HTTP proof. The enabled case was a selected RED
run, not a full-suite result; final full suites must have zero skips. New category
RED run repeats the known oversized case; only two additional cases counted.
Existing durable provider tests retain assertions with explicit synthetic owner.
Machine evidence requires both new suites and the22nd compiled production proof:
actual CJS routes/native SQLite from foreign cwd, private documents excluded before
top-five, own/shared documents delivered to a synthetic capture, invalid owner
refused with no second dispatch. Actual AI in-flight proofs are native unit tests,
not real Google requests. Dependency/lock/Node/native unchanged.

Cloud final1075/107576files (zero skips), target131/1314files and lint0;
source build0 and fresh production-only install/compiled22proof smoke0 verified
before the final test-only addition. Exact Windows/review proof must be recorded in implementation-status and
retained evidence before merge. This is not complete F04 acceptance: ordinary
backup redaction/encrypted Telegram backup, whole-app log audit, F05 browser/
coverage/actual branch enforcement, F06/F07 package/service, F09 regressions and
R02 Server2019 remain. No release/tag/VPS or live provider delivery.

The single review accepted one Important (lease fencing before Gemini) and two
Minor (serialized settings byte limit; supported-SDK bounds coverage). Three
additional actual RED cases now pass; two supported-string bounds cases were
already GREEN. Revalidation uses existing durable ownership across module import;
serialized settings use the same1MiB UTF8 byte limit as the reader. Corrected
Cloud target136/136fourfiles, full1080/108076files (zero skips), lint/build0.
Total46 observed RED contract cases/8characterizations, one pass/no rereview.
First-source Windows38186316145 verified1075/1075 per runtime/all7+22+gate;
final corrected HEAD remains pending Windows. See f04-l-review.md.
