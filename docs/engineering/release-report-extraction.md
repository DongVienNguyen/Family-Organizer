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
JSON/JUnit/native-exit policies pass; reportsVerified and publicationAllowed stay
false. Native/production/audit/raw coverage, browser engines/cases, inner package
bytes/manifest/licenses, consumer, service/coordinator and cleanup still need the
complete collector. Root certificate and Caddy execution acceptance belongs to
PR43 evidence, not to this ZIP slice. No Server2019, release/tag or VPS claim.

Source checks are215 targeted assertions across4files and frozen corrected full2214/113
Cloud assertions with zero failed/pending/todo and lint/build0. Native source,
the single wholebranch review is complete (0Critical/1Important/1Minor, both\naccepted before one correction pass). Exact-HEAD Windows and a post-merge trusted-main
live dispatch are mandatory before this slice is accepted. Historical errors and
filtered RED runs are not complete suite success.
