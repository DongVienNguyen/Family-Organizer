# Explicit encrypted backup copy and retention

F07-i adds an operator batch; it does not introduce a scheduler or another
snapshot/restore engine. Recovery.ps1 Copy/Prune uses the existing trusted manifest,
owned stopped service, Administrator and exclusive operation guard. The source is
the enabled fixed recovery-backup.json backupRoot and its original32-byte key.
The key remains in CONFIG_DIR, outside source/copy/release roots, with its private
service-SID read DACL. No key is accepted in the maintenance packet.

The bounded stdin packet has exactly copyRoot, records, keepCount and keepDays.
Each declared record has fileName (recovery_UUID.fo-recovery), sha256, bytes and
capturedAt (epoch milliseconds). Use trusted successful-capture receipts, mapping
lastSuccessAt to capturedAt; these operator-supplied timestamps are not signed age
certificates. Batches contain1–64 distinct records, keepCount2–64 and keepDays7–365.
Copy roots must already exist, be dedicated and disjoint from source, code, storage,
configuration, logs and the whole executing release. PowerShell verifies protected
Administrator/SYSTEM ownership and writer permissions on the destination directory
and every existing declared ciphertext file. DeleteSubdirectoriesAndFiles is a
write capability. Ancestors must have trusted owners and no untrusted permissions
that can replace the protected child; inherit-only grants do not apply to the ancestor
itself. New declared files are sealed before success; existing trusted files keep
their ACLs. Use a dedicated protected destination on a local volume whose ancestor chain
meets this policy (the native fixture uses a sealed directory directly under C:).
Default ProgramData permissions are not implicitly trusted; the initial corrected
Windows fixture there was refused by the ancestor check. No system ancestor ACL
is changed to make a fixture pass.
ValidateOnly/WhatIf return before stdin/mutation. No directory is created implicitly. Source, destination and protected roots are
compared using filesystem paths, including Windows8.3 expansion and directory
identity; a different lexical spelling cannot authorize a source/protected-root alias.

Copy authenticates every declared source and existing destination before publication.
The shared FO-RECOVERY-0001/AES256-GCM implementation validates exact framing, key,
nonce/tag and SHA256/size. Authentication-only inspection clears decrypted chunks;
it returns no plaintext values. Counted single-link/non-reparse reads check identity,
EOF and stable metadata. New copies use exclusive files and fsync; verified existing
copies are unchanged. A partial failing copy removes only its newly created output,
retains prior copies and every source. A process crash can leave an invalid partial
name, which subsequent verification refuses; it is never overwritten automatically.

Prune requires authenticated matching destination copies for every declared source.
It preserves the newest keepCount declared receipts and every source younger than
keepDays. Before each eligible deletion it reauthenticates that source and copy.
Unknown/unlisted files and every destination copy remain. Retention is based on
explicit trusted receipts; do not invent ages from file modification times or use
an untrusted catalog. A partially completed prune can leave fewer eligible local
copies while every deleted source still has its verified destination copy. No claim
of an all-or-nothing filesystem transaction or power-loss durability is made.

Copy/Prune do not open SQLite or alter business tables, sessions, settings or keys.
Restore still uses the existing staged I01 coordinator, schema/hash/constraints,
canonical claims and session policy. The Windows harness copies actual scheduled
ciphertext, verifies idempotency/age-count retention and refusals for file owners,
explicit writers, DeleteChild, source/protected-root8.3 aliases and hostile parents, then
restores from the copy and checks17 points/claim/business/source/key/session policy.
Only synthetic data is used. No external provider or production destination is used.

This focused PR supplies manual copy/retention primitives. Automatic policy/catalog
integration in the single AppJobs owner remains a subsequent F07 slice. A second
synthetic directory proves transport mechanics, not an independent off-host failure
domain. Actual off-host configuration/storage independence and RPO24h/RTO60m need
an authorized destination and R02. Server2019, reboot, power loss, update/rollback,
F08/F09 and F05 Administration403 remain separate; no release/tag/VPS action.
