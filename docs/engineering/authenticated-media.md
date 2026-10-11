# Authenticated legacy media

`/uploads` now requires the existing internal Bearer header. Missing/invisible files return the same404; anonymous requests and URL-only login tokens return401. Responses remain no-store/Vary Authorization and add nosniff and sandbox/default-src-none. File bytes are served only after current domain permission and ordinary-file/path/content checks.

| Canonical reference | Read policy |
|---|---|
| Avatar | Known family roles, live nondeleted user |
| Task proof | Existing task visibility: adults; limited shared/creator/assignee |
| Notes markdown | Existing Notes visibility; Admin read retained |
| Documents files | Adult plus shared/creator/owner; no private Admin override |
| Receipt, asset photos, debt attachments | Existing adult finance authority |
| Unbound upload | Uploader only,24-hour staging bound |
| Removed binding/orphan | Denied; uploader has no fallback after binding |

Version1 metadata lives in core `app_meta`, already included in I01 snapshots. Runtime explicitly reconciles legacy managed references without moving files or changing URLs. Repeat reconciliation preserves ownership, binding history and tombstones; it does not guess an owner for orphan files. New uploads receive staging metadata. Their first domain binding and business write commit in the existing synchronous gateway; forbidden additions roll back both. A managed URL cannot acquire another domain record's ACL by being copied. Existing multiple references discovered during migration remain supported, and cleanup retains files still referenced elsewhere.

Shared restore validates media metadata, restores it with canonical rows/files, and reconciles older snapshots without upload authority. Legacy-format conversion drops installation-current media metadata before reconciling the incoming references. Synthetic native tests exercise rollback, repeat migration, cleanup, staging expiry and snapshot restore; a three-process cold fixture verifies restart, restore and bound-uploader revocation. Unknown schema/role, missing metadata and orphan paths fail closed.

PNG/JPEG/WEBP/GIF/PDF uploads require canonical base64, matching byte signatures and4MiB image/10MiB PDF limits. SVG is rejected on upload and legacy serving; existing files remain on disk for operator conversion/reupload. Safe Windows paths reject traversal, encoded separators/double encoding, ADS/devices/trailing aliases; serving/writing inspect ordinary directories/files, reject links/hardlinks and use exclusive generated filenames. The later service ACL gate remains necessary against concurrent privileged filesystem tampering. Signature checks establish type, not an antivirus or complete document parser.

UI images, Markdown, avatars/proofs/receipts/photos and document PDF/original actions use a session-owned authenticated resource. Object URLs and requests are aborted/revoked on unmount/session change/realtime invalidation. PDF actions load on click, recheck on repeated clicks, remain keyboard accessible, and close their owned empty viewer on denial. Document viewers close when attachments disappear from authoritative props. Inline data/external image behavior remains. No Bearer is put in href/query/cache.

Rulings/costs: immutable domain binding prevents forged links extending ACLs; intentional cross-record reuse requires reupload. Core versioned metadata avoids a new pilot product namespace; older snapshot reconciliation must remain tested. Rejecting SVG requires explicit conversion of historical files, with no silent deletion. Generic realtime invalidation may refetch more media than necessary; F09 measures the cost. VM/hook/native fixtures are not real browsers; F05 must verify production keyboard/PDF/PWA/logout/user-switch. Windows2022 is not Server2019 R02 acceptance. Field/schema/proxy/bootstrap, reward/notification derivatives, provider/backup/log privacy and dependency triage remain F04 gates. No release/tag/VPS operation.
