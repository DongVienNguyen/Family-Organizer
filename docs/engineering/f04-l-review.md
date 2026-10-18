# F04-l single whole-branch review

BASE6be5cd5..source2d65f18, PR18; reviewed once read-only by a fresh most-capable
reviewer. No Critical; one Important and two Minor all accepted before mutation.
One correction pass, no rereview, retained assertions/no skips/continue-on-error.

Important: actor/data/settings checks omitted durable lease ownership before
Gemini; postTelegram only fenced the later delivery. Two actual RED synthetic
lease cases invalidate ownership initially or across the await import boundary.
Both require zero Gemini/Telegram calls and no lastSent. Digest revalidation now
uses the existing context ownership assertion before external dispatch, including
after import; known failure/no-auto-replay behavior remains.

Minor: a readable settings file near1MiB could be atomically replaced by an
oversized one that future snapshot/settings reads refuse. The shared reader/writer
byte limit validates serialized UTF8 before creating the temp file. One actual
RED near-limit Unicode fixture proves refusal503, identical previous bytes and
no temp file. No schema/store/backup engine replacement.

Minor: prior oversized fixture used unsupported function text, bypassing the
supported string length branches. Retained it; two new supported-string cases
(raw>4096; raw<=4096 but escaped>4096) already GREEN, so are characterizations,
not claimed RED. Both require filtered bounded fallback and aiUsed:false. Existing
supported-string HTML escaping success and all other assertions remain.

Target136/136fourfiles, Cloud lint/full1080/108076files zero skips/build0. Corrected compiled Cloud22proof smoke0 (fresh fixtures, verified unchanged
production dependency graph); exact corrected Windows proof pending before merge.
Total46 unique observed RED contract cases (one new owner requirement included)
and8 characterizations. Test-fixture corrections/draft/selected-run provenance
are in evidence/f04-l-digest-regressions.json. Reviewer did not rerun tests.

First-source Windows38186316145 independently1075/107576files per Node22/24,
seven exits0/nativeAuditExit0,22 compiled proofs/evidence/ci-gate. Both raw artifact
hashes and full-log hash in evidence/f04-l-first-source.json. Compiled proof covers
native CJS filtering/own+shared capture/invalid-owner refusal, not real AI in-flight
or Telegram membership verification. Operator controls recipient trust. F04 backup/
log, F05 browser/coverage/actual403 enforcement, F06/F07/F09 and R02 remain;
no release/tag/VPS or actual provider delivery.
