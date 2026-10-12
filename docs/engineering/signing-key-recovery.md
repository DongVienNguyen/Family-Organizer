# F07-e — explicit portable signing-key recovery

`includeFiles:["sessionSigningKey"]` explicitly selects the fixed CONFIG_DIR
session_secret.key file for encrypted backup or restore. Neither omission nor an
empty array exports/overwrites that key. Selecting a key group not present in the
backup fails before target configuration/storage. A selected missing source key is
an explicit null: selected restore removes only that target key; the next runtime
startup generates a fresh random key. All restores revoke sessions and quarantine
historical effects as before. Source files and encrypted backups are retained.

The raw key bytes are bounded4096 and must decode to nonempty trimmed UTF8, matching
the existing signing-key reader's text contract. Authenticated metadata admits only
this group, canonical base64 or null, exact fields and format1. No arbitrary paths,
.env or VAPID fields are selected. All saved file metadata is checked even when not
selected for restore. The runtime-branded frozen patch can enter only the internal
I01 coordinator. The recovery encryption key stays external stdin, never in backup,
argv, environment, logs or reports. Snapshot-read results remain cache tombstones;
restore identities bind ciphertext and explicit settings/file selection rather than
signing-key plaintext. Ordinary excluded-v1 exports stay unchanged.

When a file group is selected, the authenticated body tag is
family-organizer-private-files-v1 with the same snapshot, existing privateSettings
format and privateFiles. The older raw and private-settings wrappers remain readable
and are still written when files are not selected. Whole-payload validation and
read-only snapshot compatibility inspection precede writable storage bootstrap.

The existing shared restore journal has one optional strictly validated signingKey
entry recording original existence and selected hash/size (null/null means removal).
Old exact journal fields remain accepted. Fixed UUID-derived key staging/old paths
live in protected CONFIG_DIR. The coordinator fsyncs staging, renames old key,
promotes the selected key/removal, then commits the existing SQL marker with business
rows. The same marker decides rollback or commit for media, settings and key. Startup
recovery finishes before signing-key/auth initialization. Committed key hash/size or
absence is validated before cleanup. Staging/cleanup accepts ordinary fixed files;
no separate backup engine or public endpoint is added.

Actual Cloud REDs:22 helper,4 CLI selection,2 shared boundary/promotion and6 crash
cases (two rollback controls already passed). Replacement and removal are checked at
journal creation, old-key rename, key promotion and SQL commit; old media/settings
crash cases remain. Mandatory-suite omission also failed before the gate update.
The Cloud target109/4 passed. Full Cloud1544/1544 in89 files passed with two workers,
unchanged assertions/timeouts and zero failed/pending/todo; lint/build0. Earlier native
GC spawnSync timeouts and compiled fixture failure are retained with their actual
diagnostics. The compiled Linux diagnostic passed14 functional plus6 raw recovery,
6 private-settings and6 signing-key proofs; it is not Windows evidence. One fresh
wholebranch review and exact new-HEAD Windows quality/clean ZIP/owned PowerShell5.1
service evidence remain required before merge.
Process-crash tests do not establish Windows power-loss or Server2019 acceptance.

Provider .env/VAPID recovery, online backup/one-owner schedule/age/disk-full/retention/
offhost encrypted copy and update write-fence/guarded rollback remain later F07 work.
F05 Administration403 still prevents enforced main protection. No release/tag/VPS
access/deployment or Server2019/reboot/RPO/RTO acceptance is claimed.
