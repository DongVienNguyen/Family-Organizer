# F04-k single whole-branch review

BASEe41e97d..source441fd8b, PR17, reviewed once read-only by a fresh most-capable
reviewer. No Critical/Important; one Minor accepted before mutation. The audit
wrapper correctly propagates native failures, but evidence validated only the
wrapper exitCode and could accept missing/contradictory nativeAuditExitCode with
wrapper0 and otherwise clean reports. This is an evidence consistency gap, not
an observed PowerShell bypass.

Four actual RED regressions omit the native field or set -1,1,null with wrapper0.
The writer now requires numeric0 for both fields; valid reports, existing assertions
and all21 compiled production proofs remain. One TDD correction pass, no rereview,
no skipped tests, continue-on-error or lowered criteria. Targeted105/105twofiles,
Cloud lint/full1026/102674files (zero skips)/build passed. Previously frozen npm ci
and zero-vulnerability audit remain verified with unchanged lock.

First-source Windows38184447965 independently verifies1022/102274files per
Node22/24, zero skips, seven command exits0 including actual native audit0,
21 compiled proofs/evidence/ci-gate. Artifact hashes and full-log hash are in
evidence/f04-k-first-source.json. Reviewer did not rerun tests; these are coordinator
evidence. Final corrected HEAD must pass Windows before merge. Total39 actual RED
(19 library,1 suite omission,15 audit gate,4 review) and9 characterizations.

Provider/backup/log privacy, F05 browser/coverage and actual403 branch-policy
writes, F06/F07 packaging/service/encrypted recovery, F09 full acceptance and
R02 Server2019 remain. No release/tag, actual provider delivery or VPS operation.
