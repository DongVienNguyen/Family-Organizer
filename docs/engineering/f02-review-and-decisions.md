# F02 review and decisions

One fresh read-only reviewer assessed the whole branch and the i18next dependency
follow-up. No Critical findings; three Important findings and one smoke-evidence
gap. The author made one fix pass, preserving assertions and requiring Windows CI.

| Finding | Correction / regression |
| --- | --- |
| Windows `\data` and `/data` inherit the cwd drive despite path.isAbsolute | Shared fully-qualified drive/UNC validation; cross-host win32 path cases and every configured root |
| CLI report can enter source via ancestor junction alias | Check all existing ancestors and canonical roots before reserving report; real CLI alias fixture proves no source mutation |
| JSON-only migration can promote corrupt/unsupported shape | Parse core/collection shapes before writes; invalid syntax/shape rejected, older omitted collections accepted |
| Repeated original JSON assertions cannot prove restart persistence | Write a synthetic task change after first import, then require it after restart while legacy JSON stays unchanged |

The restart gap was graded Important by the author because otherwise CI could
approve data loss from reimport. No review finding was left as a deferred code
defect. The larger existing chunk warning remains an F09 concern.

Execution rulings:

1. Approved master/foundation documents supply design and execution authority;
   F02 root defaults are routine decisions. Cost if wrong: adjust them before
   service/package work, with these regressions retained.
2. Remote skill helper scripts/companion resource were unavailable. Maintain the
   equivalent per-task ledger and RED/GREEN outputs directly. Cost: bookkeeping
   differs; tests and verification gates do not.
3. Move Vite/build plugins and browser i18next packages to devDependencies:
   `npm explain` showed optional peers retained tsx/typescript under omit=dev,
   and server imports none. Cost if wrong: production smoke/build reveals a
   missing dependency; no frontend feature is removed.
4. Replace SQLite11.10.0 with exact13.0.3/N-API rather than downgrade Node24 or
   select12.x, which retains ObjectWrap. Allocation-driven regression aborts with
   the old binary and passes the N-API binary. Cost: a native major upgrade
   requires SQLite/migration/startup and Windows proof; Server2019 remains R02.
5. Strengthen restart evidence to preserve a post-import write. Cost: one extra
   synthetic mutation; no production data is used.

Native investigation sources:

- [Node24 ObjectWrap cleanup regression](https://github.com/nodejs/node/issues/65446)
- [better-sqlite3 consumer report, including12.x](https://github.com/WiseLibs/better-sqlite3/issues/1515)
- [13.0.0 N-API refactor](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)
- [13.0.3 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.3)

F01 load/CRUD/backup proof was real, but did not cover allocation-driven cleanup or
full production startup. The stronger F02 checks found a real unsupported path;
the earlier evidence is retained with its exact version/SHA rather than rewritten.
