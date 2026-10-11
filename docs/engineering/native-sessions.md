# F04-a internal sessions

This is the session slice of F04, not full Internet/privacy acceptance. F04-b/c
still own media/object ACL, API/PWA/private cache isolation, authenticated SSE,
input/proxy limits, backup/log privacy and dependency audit. No integration tokens
or public API are introduced; existing React/Express/SQLite behavior remains.

`server/auth.ts` is pure dependency-injected authentication. `NativeSessionStore`
uses the existing connection/write gateway. `createApp` receives that service;
runtime explicitly initializes it and checks the installation signing key before
readiness. Factory import/construction does not open storage or read secrets.
Runtime and the managed listener default to127.0.0.1. Caddy/trusted proxy/service
acceptance remains later work; this branch does not publish a server.

Internal Bearer tokens have format `fo1.<random identifier>.<HMAC>`. Identifiers
contain32 cryptographically random bytes; native storage retains their SHA256
hashes, never usable token strings. Sessions expire after12 hours absolutely.
Verification rechecks current user, soft deletion, password/role fingerprint,
persisted user version, signing-key generation and revocation on every request.
The previous `userId.HMAC(userId)` format requires one login again. Current-format
sessions persist across ordinary process restart until expiry/revocation.

Logout revokes one session. Password changes, administrator resets, deletion and
role changes increment the user's version and revoke sessions in the same legacy
gateway transaction; outer rollback restores both user data and revocation. The
last-admin safeguards remain. Key fingerprint changes advance a persisted key
generation and clear sessions; reverting a previous key cannot resurrect them.
Existing key files must be ordinary, nonempty and bounded. Read/write failures
propagate rather than silently generating an ephemeral replacement. Fresh keys
are exclusive-created, fsynced and stored under CONFIG_DIR.

Session/meta/version tables remain installation-local and outside ordinary shared
snapshot tables. Successful restore deletes active sessions in its database
commit before resuming; users log in again, including before retrying an HTTP
request whose restore was already committed. Recovery finalizes that same commit.
The shared command cache still stores only result metadata for session mutations;
no usable Bearer or plaintext password is recorded. Ordinary canonical backups
still contain private user/password/push records: broader redaction/encrypted
portable recovery remains F04-b/F07 and is not certified here.

Issuance removes expired/revoked records and retains at most32 active sessions per
user. A33rd parallel login evicts the oldest. General command-cache retention and
large-installation performance remain F09. These limits are explicit decisions,
not configurable ways to disable revocation or expiry.

The frontend captures the old token, clears local auth state immediately and
attempts authenticated logout with a5-second deadline. Network failure cannot
prove server revocation; that token remains bounded by server expiry. Successful
password change clears the client login. Browser/private-data purge and user-switch
acceptance remain F04-b/F05; clearing auth state alone does not claim those checks.
Auth HTTP responses use `Cache-Control: no-store`.

Evidence:

- Initial Windows RED: source `17932af41f5ef2f3ce941f4a8edf4cb824b683c9`, run
  https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38155413684 . Both
  Node22/24 retained311 existing passes and failed22 new unimplemented auth/store
  tests, no skips. Install/native/lint/build/production each exit0. Full logs and
  both artifacts independently read; overall CI correctly failed.
- Subsequent RED→GREEN covers persistent key-generation reversal, three corrupt
  key-file conditions, seven actual HTTP security failures, three client logout
  cases and two missing compiled-auth-evidence gates. Forwarded-header throttling
  is a preserved passing characterization. Native rollback and committed-restore
  revocation use synthetic real SQLite; provider/network calls remain offline.
- Listener default regression observed0.0.0.0 before switching to loopback.
  Existing command-retry/drain/restore assertions are retained while fixtures now
  issue current-format tokens. Restore conflict tests re-login after revocation.
- Full-suite, review and exact corrected/final Windows proof are recorded in
  implementation-status.md and PR checks. Compiled production evidence must prove
  issued-token restart and isolated logout in addition to all existing checks.

One key-error test initially used noncanonical encoding and was rejected before
key access; its fixture was corrected. A generic frontend patch was briefly
attached to the task-save handler and immediately corrected before commit; the
final diff calls logout after password change only. Neither is presented as an
independent RED proof for a security defect.

No release/tag or VPS access/deployment. Windows2022 does not certify Server2019
R02, WinSW/service stop, encrypted recovery, full browser/privacy or power loss.
