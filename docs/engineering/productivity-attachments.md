# P13 private Task attachments

Source0877389 adds the Task drawer upload/download/delete flow and explicit
pilot17 metadata. Default6, frozen1–16 migrations and package capability13 remain
unchanged. React/Express/SQLite and the single I01 writer are retained.

PNG/JPEG/GIF/WebP/PDF files are limited to20MiB each and32 active files per Task.
Names follow Windows traversal/reserved-name/Unicode rules; actual bytes must
match MIME and extension. Auth/edit checks precede raw-body buffering. Uploads
use a local binary route, without base64/global JSON-limit changes. Downloads
require current Task scope and verify complete length/SHA/MIME before attachment
response. Files live in dedicated private _task_files storage; generic media
reads/deletion cannot access it. Existing image4MiB/PDF10MiB and Wallet limits
remain unchanged. No new dependency or lockfile change was needed.

Upload owns its stage/inode and rolls back only its own bytes with SQL failures.
Delete creates a tombstone inside I01 then removes only verified committed bytes.
Each operation increments Task revision/history once; it does not change due,
completion, rewards or approval. Current ACL precedes cached receipt replay.
Snapshot validation requires active metadata and exact bytes; deleted metadata
may omit retired bytes. Original restore/lifecycle owners remain in use.

The session keeps one immutable pending Blob/revision/key through navigation and
unknown ACK. Revocation/logout clears private bytes and filename metadata, fences
late responses and rejects stale confirmation. The drawer uses existing confirm
and inline feedback. Browser download verifies actual full bytes and UTF8 name.
Both390px light/dark screenshots were inspected.

Full8675tests539files/matchingJUnit, zero failed/skipped/todo, lint/build0 at
0877389; all8630 parent cases retained plus45. Same-build Chromium21/21 first
attempts (attachments3/content4/templates3/notifications4/collaboration3/calendar4)
with isolated17/16/15/14/13/13 fixtures, offline providers, normal stop, integrity,
closed handles and cleanup. Earlier development failures remain in
[raw proof](evidence/p13-attachments-development.json), including reporter OOM
and the actual generic-cleanup flaw. Author review only; no new Windows claim.

P13 import/export and remaining master tasks stay open. New feature harnesses
must join final composed Windows qualification before PR merge. Actual Windows
Server2019 acceptance is R02 and unrun. No release, tag or VPS access occurred.
