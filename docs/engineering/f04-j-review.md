# F04-j single whole-branch review

BASE26953ea..source05d24c4, PR16, reviewed once read-only by a fresh most-capable
reviewer. No Critical/Minor; one Important accepted before mutation. Importing the
normal SQLite module creates tables/indexes/meta and switches journal mode before
the operator's pristine guard. An existing unrelated/incomplete/future-schema DB
was refused after those modifications, violating the no-repair refusal contract.

Three actual native regressions observed RED for unrelated sentinel records,
incomplete users schema and unsupported version. They compare exact sqlite_master
definitions, all logical rows and journal mode, and require closed ownership.
The existing connection now supports an internal process capability chosen only
by the local operator. Under IMMEDIATE, it refuses unknown/unsupported/incomplete/
nonempty input before DDL/meta; accepted schema creation completes under that same
lock. It preserves selected journal mode until normal runtime startup enables WAL.
The initializer still rechecks pristine storage within the existing gateway;
there is no second engine, environment override, public route or schema repair.
The compiled production probe covers all three refusal cases from System32.

Existing assertions and first20actualRED retained; review adds3actualRED. Twelve
initial failures represent absent operator requirements, not demonstrated exploits;
five other auth cases characterize valid or previously rejected behavior. First
full run's eight old fixture/context failures were fixed with explicit synthetic
input and safe db.json context, without weakening assertions. No lock/dependency
change, skipped tests, continue-on-error or rereview. Corrected targeted132/132fivefiles, Cloud lint/full978/97873files (zero skips),
build and compiled smoke passed. Exact final Windows evidence must be recorded
before merge; frozen npm ci already verified with unchanged lock.

First source Windows38182062049 independently verifies975/97573files per Node22/24,
zero skips, six command exits0,21 compiled proofs/evidence/ci-gate. Artifact hashes
and full-log hash are in evidence/f04-j-first-source.json. Reviewer did not rerun
Cloud/Windows/RED tests; those are coordinator evidence. Full F04/F05 enforcement,
F06 bundled ZIP/PS wrapper, F07 reset/encrypted recovery/service ACLs and R02
Server2019 are declined boundaries. No release/tag or VPS access/deployment.
