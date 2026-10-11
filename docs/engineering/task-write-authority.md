# Legacy task write authority

Task writes retain the existing React/Express/SQLite model and I01 synchronous transaction. The current live actor must match an authenticated command context when present, be a known nondeleted user, and retain existing task view/edit rights. Guest comments on visible tasks remain; Guest create/edit/delete and Child approval/rejection/delete are denied. Native adapters now check the same authority rather than relying solely on HTTP middleware.

| Fields/action | Authority |
|---|---|
| Title, description, dates, tags, status, recurrence, proof | Existing adult or Child creator/assignee editing grant |
| Positive reward allocation/change | Adult; Child may create zero-point tasks and retain existing points |
| Assignee on an existing positive-reward task | Adult; Child zero-point assignment stays available |
| Sharing | Adult or task creator; assignment does not delegate changing privacy |
| Creator, comments/history, completion/submission/approval/rejection/source/timestamps | Server-owned; changed client values denied |
| Unchanged full-record server fields/extensions | Structurally compared, stripped from incoming changes; canonical values retained |
| New/changed unknown fields | Rejected |

The assignee rule closes both a forged submittedBy bypass and the subtler pending/rejected flow: those records retain the Child submitter, so changing the recipient to Adult previously bypassed approval and credited that retained Child. Server completion still chooses the actual actor/submitter and existing threshold, awards once per completion transition, and preserves approval/rejection/reopen/recurrence/rotation. No second reward ledger or new domain feature is introduced.

Payloads must be plain objects with bounded field types, known lifecycle/priority/recurrence values, actual calendar dates, live assignment/rotation IDs, finite integer points and intervals, bounded tags/text and safe inline image type/signature/size. Limits: title500, description20k, comments/proof note8k, tags40×128, rotation100 unique IDs, reward0–1m, recurrence interval1–10k. New tasks start todo/in_progress. Safe PNG/JPEG/WEBP/GIF inline proofs and external images remain; active SVG/invalid base64/content are rejected, and managed URLs still require existing path/owner/reference policy. Signature recognition is a pure helper; importing the app factory does not load storage/config through this validator.

Genuine stale baseUpdatedAt remains409 with conflict:true; malformed version types/length return400. Gateway cached retries precede current record comparison and retain ownership/hash checks. Immutable fields use structural equality, preserving reordered object keys. Existing legacy extension values stay in the canonical record; their changes are rejected. No blanket migration or deletion of historical data occurs. Child UI shows read-only rewards/positive-reward assignments and creator-owned sharing, with localized policy text; actual browser acceptance remains F05.

TDD:84 initial/boundary/evidence regressions and one structural DTO regression were observed RED→GREEN, with six preserved behavior characterizations. Tests use native SQLite, real loopback HTTP and actual UI conditional renderers; they do not certify real browser interaction. Compiled Windows proof requires18 production checks including Child forgery denial, submit/adult approval/reopen and exactly-once rewards. Exact source/final HEAD Windows logs/JUnit/JSON/native/production reports are still required before merge.

Existing fixture corrections retain or strengthen assertions: commandHttp now reads the canonical DTO after its synthetic version stamp (previously mixed an older DTO timestamp with the new base); runtime-process uses the actual assigneeId API field instead of previously ignored assignedToId and asserts its persistence. The first full run752/754 with those lifecycle failures is retained; the corrected Cloud run755/75566files, lint/build exit0 has zero skips. No dependency or lockfile change; signature helper extraction preserves original Apache attribution.

Rulings/costs: adults own rewards and positive-reward recipient changes; Child asks an adult to change these values. Only creators/adults change sharing; an assigned Child asks the creator/adult to share. Full DTO compatibility retains unchanged legacy fields but rejects unsupported mutations; structural equality and fresh/stale/retry tests remain necessary. Existing editor functions otherwise remain. Remaining whole-app payloads, proxy/bootstrap, reward/notification derivatives, provider/backup/log privacy and dependency gates remain F04 work. No full Internet, foundation, Server2019, release/tag or VPS claim.
