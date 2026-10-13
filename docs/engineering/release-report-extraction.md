# F08 — bounded archive extraction and raw assertion preflight

The read-only trusted-main dispatch keeps the explicit target SHA/version/main CI
run binding. It downloads the same seven API-digest archives, derives required
unit suites/Windows lock bytes/coverage policy from that target Git tree, then
extracts report data and validates both runtimes' actual JSON assertions, JUnit
identities and native quality exit files. Downloaded harness or application code
is never executed. Publication remains disabled in source.

All seven ZIPs are checksum-checked again while native ZipArchive streams remain
open. Existing ZIP path/link/alias/file-parent/ratio/per-file budgets still apply.
The whole batch is preflighted before any report file is written; declared and
actual expansion share a 1GiB/100000-entry ceiling. Extraction directories are
fresh and identities remain fixed. Input cleanup independently compares the
original native leaf identity and exact bounded bytes; changed/missing/linked
input leaves are refused and preserved. Failed or replaced trees are preserved rather
than recursively deleting an uncertain owner.

The report reader rejects linked ancestors/leaves, replaced fixed roots, invalid
UTF8 and unsafe Windows relative paths. A file is bounded to64MiB and text reads
share a256MiB budget per reader. SHA256 is computed from the exact bytes decoded
and validated, not from a later reread. Larger package/archive hashes stream in
64KiB chunks under an explicit512MiB ceiling.

Windows quality CI adds a mandatory native synthetic seven-ZIP extraction and
low-budget rejection before the first extracted file, with Unicode/space names,
immediate native status/signal checks and owned cleanup. Source tests model
preexisting/replaced roots and partial failures. The native probe uses trusted
checkout scripts only and does not authenticate GitHub evidence.

This is a staged preflight: rawQualityAssertionsVerified is true only after both
JSON/JUnit/native-exit policies pass. F08-f additionally reads both runtimes'
actual native.json, production.json, audit.json and audit-context.json, requiring
exact agreement with their quality receipt and the expected target Git context.
It checks pinned Node/addon/SQLite/binary identity, six native checks, 23 compiled
production checks, seven schema-preservation refusals and zero audit vulnerabilities.

Raw coverage is read from coverage-final.json, coverage-summary.json, LCOV and
HTML. Its exact byte hashes, counters, source inventory and floors must agree
with the target Git policy and quality receipt. Only unique safe Windows source
suffixes are normalized; extra/missing sources, aliases and mismatched counters
are refused. runtimeProductionAuditVerified and rawCoverageVerified are set only
after both runtimes pass. Each reader is bounded and rejects linked/replaced files.

reportsVerified and publicationAllowed remain false. Browser engines/cases, inner
package bytes/manifest/licenses, consumer, service/coordinator, SDK/Caddy and all
cleanup reports still need the complete collector. No report supplied separately
by an operator is authenticated authority. The live adapter reads the same-process
API-bound extracted archives; it never executes downloaded code.

PR44 accepted Windows2249/114 with both pinned local SDKs and native synthetic
archive extraction. The real trusted-main dispatch38345761738 accepted seven
archives/743files/100984074 expanded bytes and raw2150/110 assertions from explicit
targetfb11d05/mainCI38339664320. Both were staged checks, not full F08 acceptance.
F08-f has232 targeted assertions; its new exact-HEAD Windows and post-merge live
checks must be recorded separately. Root certificate/Caddy proof belongs to PR43.
Server2019, release/tag and VPS are unrun and unauthorized.
