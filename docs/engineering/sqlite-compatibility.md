# F06-a: refuse incompatible SQLite before initialization writes

Normal runtime previously enabled WAL and created missing tables/indexes before
checking app_meta.schema_version. Actual Cloud baseline at27e0691 rejected
version999 but changed journal DELETE→WAL and SQLite objects2→54. The source
version and synthetic future record survived; schema/journal were still modified.
This was a development diagnostic, not Windows package evidence.

Bootstrap now holds one native BEGIN IMMEDIATE transaction through inspection,
schema creation and metadata commit. A genuinely empty database can initialize.
A nonempty schema must contain app_meta with exact supported legacy version1;
missing/blank/unknown versions are refused rather than assigned1. Existing native
errors for malformed metadata stay visible to ownership tests. On initialization
failure, rollback precedes native close; WAL is enabled only after successful
schema commit. The local first-account capability retains its pristine-store
refusal and existing journal policy. No second migration/backup engine is added.

Supported v1 partial legacy schemas still gain missing owned tables and preserve
canonical rows and independent domain tables. Existing gateway/migration checks
remain in place; this slice does not yet supply release manifest bounds, portable
ZIP/runtime isolation or full downgrade/update orchestration.

Eight actual RED native fixtures cover future/older/blank/missing versions,
foreign SQLite, malformed metadata and a malformed owned table. They compare
original bytes, sqlite_master, all records and journal mode, verify close and
rename the database while the test process lives. Two positive characterizations
cover fresh persistence/restart and v1 partial/schema extensions. Mandatory compiled
production smoke adds five genuine failed-startup fixtures from a foreign cwd;
all preserve bytes/schema/records/DELETE journal and release file handles, with
bounded offline child processes and cleanup. Evidence refuses missing/contradictory
case identities, exits, preservation/hash/cleanup/network metadata. Eleven actual
new-evidence RED cases protect the required suite/proof and report gate.

Full Cloud1243/1243 tests81files, target152/152 fivefiles, lint/build/audit0,
fresh production-only npmci and allfive compiled failed-startup preservation
fixtures passed. Actual104file Cloud coverage agrees with the unchanged measured
floors. These are development diagnostics. Final exact-HEAD Windows proof/review
are pending. Windows2022
source/compiled layout is not F06 ZIP acceptance or R02 Server2019 acceptance.
No release/tag/VPS access/deployment.
