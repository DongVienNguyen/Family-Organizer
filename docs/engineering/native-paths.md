# F02 — Native paths and explicit legacy copy

The application resolves its installation root from the source module or the
bundled `dist/server.cjs`, never from the working directory. Development defaults
to `<codeRoot>/data`; production requires an absolute `DATA_DIR` outside the
release. Relative, Windows root-relative (`\\data`, `/data`), drive-relative and empty roots fail startup; Windows requires a drive-qualified path or complete UNC share. `APP_CODE_ROOT`
is an optional absolute override for development/test tooling.

| Launch-time environment | Default | Contents |
| --- | --- | --- |
| `DATA_DIR` | codeRoot/data in development; required in production | family.db, legacy db.json, uploads, backups, legacy update mailbox |
| `CONFIG_DIR` | DATA_DIR | session_secret.key, app_settings.json, optional .env |
| `LOG_DIR` | DATA_DIR/logs | application/service log destination |

Set these and `NODE_ENV` in the process/service environment **before** launching
Node. They do not bootstrap from a `.env` file. Provider configuration is loaded
only from the chosen `CONFIG_DIR/.env`; an unrelated CWD `.env` is ignored. For
development, move an old repository `.env` explicitly to `data/.env`, or export
provider variables into the process environment. Do not commit real credentials.
Keeping `CONFIG_DIR=DATA_DIR` initially preserves the old layout and session key.
If a separate config directory is later selected, explicitly copy the settings,
session key and provider file there while the application is stopped. F07 will
own service ACLs/log rotation; this PR selects and checks the roots only.

Storage initialization checks actual create/remove permissions for data/config/log
directories before opening SQLite. An invalid legacy `db.json` fails startup
without replacing it with a new seeded family. Import of a valid selected legacy
JSON retains IDs and the original JSON file. No database is discovered from CWD.

## Native scripts

- `npm run clean`: deletes only `dist` and old `server.js` under the verified
  script installation root. It rejects linked/junction targets and external path
  arguments. Data, releases and another working directory are preserved.
- `npm run release:notes -- 1.1.0`: read-only changelog section extraction; it
  does not change version/lockfile, commit, tag or publish anything.
- `npm run release`: fails with a Windows foundation message. The former Bash
  release script is removed. Candidate automation belongs to F08.
- `npm run data:migrate -- ...`: explicit offline copy; no implicit move/delete.

## Copying an old data directory

Run only against synthetic data in CI. For a real installation an operator must
stop the old application and all writers first; no production migration is
authorized by this foundation task. The destination and recovery backup must be
new, absolute, nonoverlapping directories. Source/target/backup/report ancestor and nested input symlinks/junctions
are refused; all containment comparisons use canonical roots before report reservation. A report must be outside all three roots and have a new filename.

```powershell
# Dry-run: source remains untouched; no destination or backup is created.
npm.cmd run data:migrate -- --source 'C:\Old App\data' --target 'C:\ProgramData\FamilyOrganizer\data' --report 'C:\Migration Reports\preview.json'
if ($LASTEXITCODE -ne 0) { throw 'Migration preview failed' }

# Apply only after stopping the application and reviewing the preview.
npm.cmd run data:migrate -- --source 'C:\Old App\data' --target 'C:\ProgramData\FamilyOrganizer\data' --backup 'C:\Recovery\before-migration' --report 'C:\Migration Reports\applied.json' --apply --confirm-offline
if ($LASTEXITCODE -ne 0) { throw 'Migration copy failed; keep source and recovery backup' }
```

SQLite is opened only on a private physical copy, because readonly WAL opens can
still create sidecars beside the source. The copy includes committed WAL, then
uses the SQLite backup API and integrity check to create the recovery database.
Settings, session, media and other files are copied, and all copied files are
hashed before promoting the staging directory. Source changes abort the copy;
existing targets are never overwritten. Failure keeps the source and recovery
backup; a partial recovery backup is **not** a validated restore. Reports list
paths/sizes/hashes, never file contents or provider values. Protect the backup
and reports as sensitive installation material; encrypted recovery belongs to
I01/F07. This offline copier is not a second online snapshot engine.

## Verification scope

Unit/native regressions cover root selection, Unicode/spaces, safe clean,
changelog extraction, legacy JSON preservation/corruption, JSON-only shape validation/older omitted collections, offline copy,
integrity/hash verification, overlap/existing target and linked inputs. Windows
CI also installs only production dependencies into a clean Unicode/spaces layout,
runs bundled Node entry from System32 with synthetic external storage, checks
HTML/PWA/login/IDs/restart persistence and write-denied startup, blocks all external
provider calls, then closes/kills child processes and verifies fixture cleanup.
It stores `production.json`, npm/server/probe logs and explicit exit evidence.

This verifies a production layout, not a finished ZIP/service. Exact portable
runtime/native packaging belongs to F06, graceful lifecycle/drain to F03, full
regression to F05/F09, and Windows Server2019 acceptance to R02.

Native compatibility delta: F02 pins better-sqlite3 13.0.3, whose N-API binding
avoids the Node24 ObjectWrap cleanup abort reproduced with11.10.0. The previous
F01 native-load/build proof remains historical; it did not exercise allocation GC
or full production startup. `tests/native-gc.test.ts` uses allocation-driven
statement finalization and is required by the evidence gate. No stress-test retry,
skip or threshold relaxation is used. Vite/plugins and browser i18next packages
are devDependencies so production installation excludes tsx/vitest/typescript;
frontend production build remains required. Production smoke mutates a synthetic
SQLite task after first import and verifies that mutation after restart while
original db.json stays unchanged. Windows verification remains distinct from
Server2019 acceptance R02.
