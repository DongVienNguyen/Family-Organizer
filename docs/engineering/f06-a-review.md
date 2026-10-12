# F06-a whole-branch review

One fresh read-only review of BASE01b9a21..a113d30. No Critical; one Important
and one Minor. Both accepted before one TDD correction pass; no rereview.

Important: SQL LIKE sqlite_% uses a wildcard underscore and ignores legal user
tables sqliteX/sqliteData. Normal compatibility inspection could therefore alter
a foreign database; the shared preexisting first-account pristine predicate could
also allow initialization into it. Two genuine native startup and two operator
RED cases confirm the bug. All relevant store and fixture enumeration now uses
literal reserved-prefix GLOB sqlite_*; both entry points preserve bytes/schema/
records/journal. Compiled production smoke now includes both legal foreign names.

Minor: regular-expression validation coerced a one-element hash array into a
string. One actual RED evidence case now requires a string before SHA256 format
validation; complete compiled preservation metadata remains mandatory.

Five actual review RED cases and143 prior positives in threefiles. Corrected
target157/157 fivefiles, full Cloud1248/1248 in81files, lint/build0 and allseven
production-only compiled preservation cases passed. Final exact Windows pending.

First-source Windowsa113/run38194460620 passed quality1243/81 on both runtimes
with all8checks0/audit0/23compiledproofs and104file coverage, but browser14/15
failed WebKitB05 when deliberate reload cancelled unfinished initial image fetches.
Trace timing/readable error/JSON/JUnit and all artifact hashes retained. Added
positive visibility/decode completion for Member private/shared images before
reload; all existing pageerror/ACL/late-response assertions and zero retries remain. No portable-package/service/Server2019 acceptance claim.
