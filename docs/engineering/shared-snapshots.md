# I01-c shared snapshots and journaled restore

Base/main `fb583fe82348ba5299c60d03a18c1d7b72412c1a`, following reviewed,
verified PR #5. Part(c) is implemented for review; full I01 acceptance still
requires exact-HEAD Windows GREEN and integration. Domain features remain off.

`collectAppSnapshot(tx)` copies the current gateway document, trusted registered
SQL tables, namespace/schema versions, public settings and immutable media bytes
synchronously on the existing SQLite handle. WAL writes cannot interleave inside
this transaction. There is no second connection manager or scheduler. Returning
large snapshots through a write command stores only a read marker, preventing
recursive command-cache snapshots. Such a return is refused if the command
changed SQL/legacy/schema; retry uses a fresh read request ID. Ordinary business
commands keep their idempotent result contract.

The manifest has schemaVersion1, wallet/productivity versions (explicit0 when
absent), legacyVersion1, mediaManifest/path/size/SHA256, canonical JSON checksum
and createdAt. Trusted code registers table/column definitions; snapshots carry
rows, never executable DDL. Existing schemas and migration identities must match.
Missing namespaces, unsupported versions/columns, duplicate primary keys,
missing canonical reward references and malformed jobs/command metadata fail
validation. Future P02/W02 ports must register their complete schemas/validators
and prepare compatible cold-domain migrations before feature enablement; this
part does not claim future Wallet/Productivity cold restore acceptance.

Media paths reject traversal, ADS, Windows device names, directory/file aliases,
case/normalization collisions, symlinks and junctions. Captured bytes have stable
hashes, so ZIP export never archives changing live paths. Limits are256MiB for
serialized/expanded input,10,000media files and100,000rows; immutable capture uses
bounded RAM. Settings include rewards, delivery flags/last-sent dates and external
service links. Named API keys, Telegram credentials and session signing secrets
stay local; restore replaces the complete public allowlist (including absent keys),
while retaining local-only configuration. Canonical DB content
still includes private user/auth/push records. These backups are not encrypted;
F04/F07 must provide the privacy audit and separate encrypted portable recovery.

## Restore ownership and recovery

1. Validate structure/checksums/versions before live promotion. A restore request
   retains its internal owner token. Runtime maintenance gates requests/readiness,
   ends SSE, pauses the same AppJobs registry and drains every other accepted
   handler/response and detached effect. It excludes only that restore owner;
   shutdown still waits for its work after client disconnect.
2. Revalidate after drain, retain a native SQLite safety copy under backups/, and
   stage fsynced immutable media/settings under UUID-derived configured roots.
   Persist a self-checksummed restore journal before any promotion. Writer and
   reader share a32MiB bound covering all10k supported512-unit media paths; writer
   refuses unsupported size before publication/promotion. Uploaded
   documents cannot supply journal paths.
3. Promote old/staged media and config, restore trusted rows and legacy data in
   the same gateway transaction, drop restored historical pending/leased work
   (retain explicit future schedules), and insert the SQL commit marker together.
4. Before resuming, verify committed media/settings and remove obsolete staging.
   Missing SQL marker rolls promoted files back; present marker finalizes the
   validated new files. Runtime startup performs the same recovery before legacy
   seeding/readiness. Invalid journal, mismatched marker or failed recovery keeps
   startup/runtime unavailable without deleting arbitrary paths.

A recoverable failed operation resumes only after rollback completes and reports
its original error. Pre-journal failure removes its own staging; a process crash
before journal publication leaves unpublished UUID staging for operator cleanup.
Safety SQLite copies remain for operator recovery; they are not a complete older
media archive or an automatic post-commit rollback. Power-loss/filesystem durability
and Windows service/operator recovery remain F07/R02 gates; process-crash tests
are not a power-loss claim.

Restore command retries use the authenticated actor/request/hash. A committed
retry returns its prior result without overwriting subsequent writes; conflicting
actor/hash returns409 through both HTTP restore routes. ZIP retries hash original
archive bytes; JSON inputs hash the original document; file-backed requests bind
to the backup ID before mutable metadata lookup. Compatibility timestamps/current
tables cannot change a committed retry identity. Backup metadata filenames are
validated before restore and at every delete/retention consumer. Within the SQL
transaction, references are reconciled with ordinary bounded local JSON files;
missing files are removed and existing orphan files are retained safely. Old JSON/ZIP format1 is accepted only while all domain
versions are0 and completion claims absent. It cannot reconstruct old command
caches, so only bootstrap records survive that compatibility conversion. After
cutover, the shared manifest is required to avoid silent domain/points loss.
New JSON backups include the shared snapshot and media; ZIP format2 contains
snapshot.json metadata and uploads/. Archive size/count, names/aliases/links and
checksums are checked before restore; malformed imports create no safety backup
or live data/media change. Backup routes now await the coordinator.

## Evidence and pending gates

Windows RED at `4d8017043cf69e64ad4673a9dd83a1c24923c6d6`,
[38150822113](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38150822113):
both Node22/24 retain265passing existing tests; nine new tests fail at the explicit
snapshot registry stub. Logs and both artifacts downloaded/independently read.
Further Cloud RED covers owner port, startup recovery, correct-checksum invalid
structures, restore retry, recursive read caching, ZIP unsafe inputs and public
settings preservation. Supplementary HTTP tests prove live worker/request drain
and shutdown after disconnect. Six fresh-process crash boundaries cover journal
publication, media moves, settings moves and SQL commit.

First source `af8961f93ef4f000bfacb8f252b6bf8cfb366fc3` independently verified on
Windows run [38153439050](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38153439050):
both Node22/24 passed300/300 in38files, all six command exits0 and ci-gate.
One fresh whole-branch review found six Important issues; all received a single
RED→GREEN fix pass with11 additional regression cases. Corrected full Cloud
suite311/311 in38files passes; lint/build separately recorded. Corrected source `7473483486e7499ed169ca3208a4d3fdbabf0adc` independently verified
on Windows run [38154465590](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38154465590):
both runtimes311/311, all six command exits0 and ci-gate success. Reports/hashes
are in `evidence/i01-c-corrected-source.json`. Final documentation HEAD must also
pass exact Windows CI; its proof belongs in the PR evidence comment. No skips,
weakened business assertions or real provider/AI calls. No dependency/lock changes.
The first pre-journal failure test was affected by the preceding corrupt-journal
fixture deleting its directory; it did not independently prove cleanup RED.
The corrected suite recreates fixture directories and explicitly checks cleanup.

Remaining gates include F04 auth/media/privacy/dependency audit, F05/F09 full
browser/coverage/performance, F06 portable ZIP, F07 service/encrypted recovery,
R02 Server2019 and all later domain/integration milestones. Windows2022 is not
Server2019 acceptance. No release/tag or VPS access/deployment occurred.
