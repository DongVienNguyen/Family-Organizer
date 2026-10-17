# Private Wallet receipts — W02/W03/W04/W06/W16 partial

Source `57c9548a20cb3a7312fd571fbba0fcfa765ba0e2` adds a private receipt manifest and the gated record receipt
workflow. It does not activate Wallet, migrate legacy images or complete Wallet.

Uploads accept canonical base64 PNG/JPEG/WebP/GIF (4 MiB) and PDF (10 MiB), with
content signature, filename, size and SHA256 checks. Each record allows20 receipts.
Browser images reuse the existing optimizer/HEIC conversion; PDFs retain their
bytes. Physical filenames are opaque UUIDv4 keys under `uploads/wallet-receipts`.
The dedicated top-level namespace preserves previously valid generic receipt
subfolders, including `receipts/wallet-private`. Generic uploads cannot allocate
this new category; generic serving and cleanup deny it before media bindings,
uploader ownership, avatar reuse or other legacy policies can grant access.

File preparation verifies ordinary paths/files, link count, identity, bounded
reads and content hashes, writes exclusively and fsyncs/closes before I01 claims
the metadata. Rollback removes only an owned, unchanged, unclaimed stage. A lost
postcommit acknowledgement never removes claimed bytes; same-key replay does not
stage another file. File preparation is outside the short SQL callback. Revision,
current actor/grants, record ownership and audit remain inside the I01 command.
Receipt changes do not alter postings. Audit stores hashes and metadata rather
than receipt bytes or raw filenames.

Authenticated record endpoints list, attach, download and detach. Reads require
current access to every posting; a one-sided transfer exposes no receipt metadata
or bytes. Writes require the record policy and expected revision. Private/missing
resources give404; bad input is400/422 and limits413. Downloads use no-store,
nosniff, restrictive CSP and attachment disposition. The browser SDK binds the
response to the requested record, verifies downloaded size/MIME/SHA256 and rejects
session changes. It creates no public URL or integration credential.

Additive Wallet storage5/standalone snapshot6 leaves migration identities1–4
unchanged. Shared I01 snapshots validate receipt parent/actor, opaque key, MIME,
size, hash, timestamp and corresponding media bytes before maintenance or writes.
Shared restore and read-only recovery use the same validation. A standalone
Wallet snapshot is data-only, not a complete installation/media backup. Explicit
converters support old standalone2–5 and shared0–4 to the installed receipt schema;
normal restore stays version-exact, and the existing version4 conversion default
is retained. Pilot migration on installed5 requires a matching durable safety
backup and leaves unresolved legacy media pending. Startup only registers the
installed schema, with no automatic upgrade or activation.

The record UI provides attach/download/confirmed detach with the existing theme,
translations and session-owned command. Unknown outcomes retain the original
payload/key across navigation and require explicit retry. Refresh clears visible
receipt metadata immediately; partial/revoked/retired views cannot expose late
binary responses. Confirmation binds the selected record/revision. Detach removes
the record reference, retaining inaccessible bytes for restore; it is not physical
privacy erasure. An ownership-aware orphan/backup retention job remains pending.

Verification: Cloud7096tests/381files/matchingJUnit, zero failed/skipped/todo; all6952parent+144 retained. Lint/build exit0. All parent unit/integration names and multiplicities are
retained; only the existing five temporary recovery-root names are normalized.
Native Chromium14/14 retains the prior12 and adds actual PDF/image upload,
byte-exact download, private URL denial, confirmed detach and committed-but-lost
response replay across tab navigation. Real Express/SQLite, synthetic fixtures,
zero external attempts, integrityOK, legacy data retained and normal shutdown.
The final build matches the browser-tested server/index bytes. RED and failed
browser reports/traces are preserved; label/description semantics and an incorrect
new-test readiness helper were corrected without weakening existing assertions,
adding retries/skips or changing timeouts. A schema5 pilot regression and overlong
receipt-ID400 regression also preceded their repairs.

[Proof](evidence/w04-private-receipts-development.json) and
[browser cases](evidence/w04-private-receipts-browser.junit.xml) and
[full compressed JUnit](evidence/w04-private-receipts-cloud.junit.xml.gz) bind reports to the
committed paths. Author inspection only; no independent whole-branch review yet.
PR/CI URLs:none; backup branch `codex/feature-first-acceptance`. Current Windows2022/
Node22, Firefox/WebKit/touch, package/service and actual Server2019R02 are unrun.
No dependency/lock/workflow change, release/tag or VPS access/deployment.

Required next: legacy receipt copying/remediation and old-URL ACL before cutover;
raw legacy JSON/ZIP conversion and the legacy write bridge; retention, grants UI,
durable bulk/remaining filters, reporting/export/audit and the remaining Wallet,
M1, I02/I03/master acceptance gates. OCR/warranty/settings/PWA and full W16 are not
claimed by this receipt workflow. No plan scope is waived.
