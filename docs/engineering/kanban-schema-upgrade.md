# P08-b3: explicit board schema7 and recovery

Reviewed source slice; exact-HEAD Windows acceptance is pending. Runtime schema7
support has passed Cloud checks; no board HTTP/UI/default cutover or full P08 acceptance.

`registerBoardMigration` registers shared snapshot columns and migration7 only
through an explicit pilot caller after base1–6 registration. New/default pilot
registration remains1–6. Ordinary startup never calls `applyDomainMigrations`;
when an already validated image is7, bootstrap registers its known migration and
snapshot definitions without running DDL. Frozen1–6 DDL/checksum strings and
Wallet1 remain unchanged. Task/section/Matrix commands deliberately accept7.

Readonly compatibility checks exact owned board DDL/indexes, migration7 checksum,
required tables and absence of candidate artifacts on earlier schemas. Ordinary
bootstrap validates current board foreign keys and canonical membership; offline
replacement restoration can inspect damaged live data while still requiring valid
replacement data. The pure shared snapshot validator checks board/list scope,
policy/integer bounds, unique identities, column references and canonical Task
membership before promotion. Existing over-limit states remain restorable; snapshot
admission does not silently drop Tasks or enforce new-entry capacity as cleanup.

Synthetic source tests preserve1–6 migration records and Task IDs, prove ordinary6
inspection has no automatic board DDL, check future8 refusal, and roundtrip Task,
ACL, board positions, Matrix pins and Wallet1 signed64-bit extremes without new
points or notifications. Invalid replacement references/limits/ranks/modes and
archive membership refuse before native changes. An authenticated encrypted payload
roundtrip is distinct from the actual operator test.

The new compiled operator test builds CommonJS in completed builder subprocesses,
uses isolated installations and native SQLite, and checks encrypted backup/restore
into an independently prepared7 target. An old6 target, damaged owned index and
future8 refuse before DB byte changes or restore journal creation. Another process
backs up the restored7 target. All subprocess exit/signal results and offline
network log are checked, and fixtures/handles are removed. Native integer reads use
BigInt before conversion to decimal, preserving Wallet extremes. This is a compiled
source test, not evidence from the promoted Windows ZIP or Server2019 acceptance.

Retained failures distinguish product and fixture causes: initial upgrade4/1/3
refused schema7 at the existing canonical bridge; a new bootstrap table query broke
one selected schema0 recovery case (39 others unselected in that diagnostic report),
then all40 original recovery tests passed after guarding the read. Initial compiled
fixtures used an invalid empty view filter; the existing validator correctly
refused it. The fixture now provides required rootsOnly and retains original
business assertions. No production validator or assertion was weakened.

ONE whole-branch SELF-review0Critical/0Important/1Minor was graded before one test correction, with no rereview or remaining findings. The mixed restore now has a real member/read grant. Final Cloud3713tests/202files/matchingJUnit/all0;263target/3files/lint/build0. New exact-HEAD Windows reports remain pending. Shared
board configuration, ACL/private count DTOs, admin override/audit, preview/apply,
grouping and internal HTTP remain later P08 work. P09 owns UI; P10 owns new completion.
Default activation, release/tag/VPS and actual Server2019 remain unapproved/unrun.
