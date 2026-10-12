# F07-d — explicit private application settings recovery

Extends the existing encrypted operator with optional `includeSettings`, an array
containing `gemini`, `telegram`, both, or neither. `gemini` selects only geminiApiKey;
`telegram` selects botToken/chatId plus telegramWeeklyDigestOwnerId as one group so
recipient credentials are never silently detached from their canonical digest actor.
Unknown/duplicate groups, unknown or missing fields, invalid types/control bytes and
values above the declared byte bounds are refused. The bounds are512 bytes for
Gemini/bot keys,128 for chat ID and256 for owner ID. Selected missing keys are explicit
nulls: applying that selection removes that target key. Unselected keys remain local.

Backup and restore each choose their groups explicitly. A backup can contain both
but restore only Gemini; omitting groups restores business data and preserves local
private settings. Selecting a group absent from the authenticated backup fails
before target configuration/storage imports. Every saved group is validated even
when it is not selected for restore. No implicit private-key selection or whole-file
export occurs. The recovery key remains external stdin only.

Old snapshot-only envelopes remain readable and are still written when no group
is selected. Selected backups use the authenticated body tag
family-organizer-private-settings-v1 containing the same I01 snapshot and strictly
bounded selection metadata/values. Nothing is added to ordinary excluded-v1 exports,
release packages, reports or command-cache results. Snapshot-read wrappers are marked
so the gateway stores only a read tombstone; restore identity hashes ciphertext plus
selection, avoiding an unkeyed plaintext-secret verifier in exported metadata.

Restore selects a frozen, runtime-branded patch, accepted only by the internal shared
snapshot coordinator. Before its safety copy/staging, it merges selected private
values with local unselected settings and snapshot public values and enforces the
existing1MiB settings limit. The same app_settings staging, checksum, durable journal,
SQL commit marker and startup recovery cover that merged file; no parallel engine or
new public endpoint. Sessions are revoked, effects quarantined and claims retained.

The owned Windows wrapper keeps its existing package/service/ACL/closed-handle and
exclusive operation scope, ValidateOnly/WhatIf and bounded UTF8/native exit policy.
Tests are synthetic/offline, with only names/hashes/exit codes in reports. Exact
Windows ZIP/service execution is pending for this branch; predecessor evidence does
not establish its new behavior.

This focused PR covers private app_settings groups. Provider .env/VAPID values and
session_secret.key are not captured or overwritten. Their explicit portable file
recovery, online orchestration/scheduler/retention/off-host encrypted copy and guarded
update/rollback remain later F07 work. F05 still has actual GitHub Administration403;
Server2019/reboot/RPO/RTO/release/VPS remain unrun or unauthorized.
