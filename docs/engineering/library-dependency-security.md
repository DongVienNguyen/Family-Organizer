# Library dependency security (F04-k)

Nine remaining npm audit entries cover Vitest/mocker, browser mapping/Browserslist,
brace expansion, Nanoid, PostCSS/source-map-js and protobufjs. The frozen lock uses
published compatible fixes: Vitest4.1.11 and its seven coupled ecosystem packages;
baseline-browser-mapping2.11.0, Browserslist4.28.7, brace-expansion5.0.12,
Nanoid3.3.18, PostCSS8.5.23, source-map-js1.2.2 and protobufjs7.6.5. Three browser
reference datasets update to satisfy Browserslist dependency minimums. Total18
dependency nodes plus exact root Vitest pin; no package paths added/removed.
Native13.0.3 and the pinned Node22/24 runtime/toolchain are unchanged.

Registry versions, engines and licenses are recorded in evidence; downloaded
seven minimum-fix tarballs match published SHA512 integrity. All engines admit
both pinned Node versions. MIT, Apache-2.0 and BSD-3-Clause license obligations
remain part of F06 package notices. Lock entries select explicit compatible fixes;
frozen npm ci and exact Windows checks must validate the final graph. This does
not introduce root overrides, audit exceptions or a blanket dependency upgrade.

Nineteen observed RED library cases cover automatic PostCSS map disclosure when
CSS source is unset; invalid indexed line/column offsets accepted before potentially
expensive mapping; protobuf option parsing looping at EOF; Nanoid negative/zero
sizes looping; brace character-budget/deep-stack failures; invalid Baseline options
terminating an importing caller; and malformed browser stats causing a type/prototype
failure. A separate actual RED gate case requires the library suite. Nine cases
characterize valid/currently safe behavior, including the provided-CSS-source map
case already refused by the baseline. Do not count all new cases as prior exploits.

The library tests use isolated synthetic .map content and offline owned children:
64MiB heap,10second startup,2second operation deadline,64KiB output limit; readiness
starts the operation timer after import. Any forced signal/OOM/process exit fails
GREEN assertions; it is not treated as successful rejection. Timers/processes and
fixtures close in finally. Valid inline/relative maps, normal protobuf/generators/
brace/browser inputs and indexed mappings remain covered. Existing assertions and
all compiled production proofs remain. Required evidence rejects omission of this
suite; no skips, continue-on-error or lower standards.

CI now runs a mandatory native npm audit on each Windows Node22/24 job. PowerShell
captures the Node and npm exits immediately, saves raw JSON/stderr and reports
exact SHA/runtime/hash of the scanned lock. Fifteen additional actual RED cases
require audit files/native failure evidence, zero consistent vulnerability counts,
and matching HEAD/runtime/lock. The writer rejects registry error JSON even with
an exit0 and contradictory zero totals. Audit is a seventh required check;
ci-gate still requires the whole matrix. This does not prove main branch protection:
the F05 ruleset/protection API remains403. Cloud full1022/102274files, zero skips,
lint/build/audit passed; actual PowerShell wrapper requires Windows CI.

These reproduce library behavior, not proof that every advisory is exploitable
through the application. CSS/browser tools operate during trusted builds; current
Vitest run does not expose the vulnerable dev mock HTTP endpoint. protobufjs is
in the production provider dependency tree, but tests never call real providers.
Vitest redirect-mock and Browserslist cache-eviction advisories are patched within
this graph and covered by existing runner/build regressions; this branch does not
claim an independent HTTP exploit/cache-OOM reproduction. Audit count is a registry
snapshot, not complete security acceptance. F04 provider/backup/log privacy,
F05 browser/coverage/enforcement and F06/F07/F09 package/service/full-regression
gates remain; Windows2022 is not R02 Server2019. No release/tag/VPS operation.
