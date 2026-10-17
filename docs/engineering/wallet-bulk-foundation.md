# Durable selections and atomic metadata bulk — W02/W04/W06 partial

Source `f324743af7cda1e79311630392d8f4a93606bf94` adds server operations and the browser SDK. It does not yet
add the selection/bulk UI or complete W06. Wallet remains off by default. Schema6
(standalone snapshot7) is explicit; startup preserves the installed supported
version without migrating or activating it. A single additive descriptor chain
now supplies registration, cold inspection, snapshot columns and conversion;
accepted SQL/checksum bytes1–5 remain unchanged. Old normal restore remains
version-exact; explicit offline conversion adds empty selection tables. Shared
restore/recovery, schema6 legacy pilot replay and private receipt conversion are
covered, including cold index/future-version rejection without repair.

A selection stores actor, shared normalized filter identity or explicit IDs,
ordered record IDs/revisions and a15-minute expiry. Query capture uses the same
predicate under I01 without hydrating unsearched note bodies. Later matching
records stay outside it. Membership checks are limited to100 requested page IDs
and current ACL, returning IDs in requested order. The opaque operation ID never
grants authority and is not an integration credential. At most100000 live entries
and100000 selection rows are permitted globally; capture removes expired stages,
and actor-owned release cascades only staging rows. These are resource bounds,
not a100000-row performance acceptance claim.

Internal Bearer-session routes create/release selections, check page membership,
preview and apply bulk. They use existing current role/grant authorization, safe
request IDs and no-store responses. Child/Guest/anonymous are denied. There is no
activation endpoint or public integration surface. Filter snapshots require their
original canonical filter; explicit exclusions must belong to the snapshot.
Direct IDs require each expected revision. A single private, partial, read-only,
wrong-creator, stale or unsupported selected row rejects the whole operation;
no row is silently skipped. Linked fee access follows ordinary record policy.
Trade, direct fee, occurrence, voided and allocated records still need their
specialized workflows; W07 and later tasks must finish those applicable paths.

The patch permits category, labels, settlement status, payee and note only.
Catalog rules are shared with ordinary records, retaining already-selected hidden
historical definitions but refusing new assignment. Integrity validation covers
known creators, complete metadata, valid timestamps/provenance and revision
bounds. Amount/account/FX changes and mass voiding are rejected. One I01 root
uses parameterized set-based SQL and a transaction-owned temporary work table;
no nested per-record public commands or100000-note JS hydration is introduced.
Only changed records gain a revision/audit; counts distinguish matched, changed
and unchanged. Before/after audit metadata contains category/labels/status/revision
and text length/SHA256, never raw note/payee. Money, postings, FX, linked fee,
source, creator, date and original creation facts remain. The1.003-record native
regression confirms bounded SQL calls and exact row/audit coverage; large Windows
performance remains a later acceptance gate.

Snapshots are one-use with revision2/applied identity. Same actor, nonce and
payload replay returns only the original compact counts/operation acknowledgement,
even after expiry or loss of current-record grants. This deliberately permits
resolving an unknown result without exposing any current financial body. Fresh
adult/deletion/role and activation/schema gates still precede replay. New nonces
must pass all current row ACL/revisions and snapshot lifetime/state checks.
Malformed success replies remain unknown in the SDK; no automatic retry occurs.
A native second-audit fault proves complete rollback of record/metadata/labels,
audit, command cache and temporary table, followed by valid same-key retry.
Only current readable adults receive an empty FINANCE_UPDATE after commit;
rollback and cached replay do not broadcast.

Preview owns no writer/cache and supplies exact counts and up to five changed
before/after samples with explicit text truncation. ACL/revisions are checked
again after hydration. The SDK validates bounded samples, direct-ID coverage,
identity, revisions, counts and expiry; type-only server contracts remain outside
the browser bundle. Session transport continues to discard old-session responses.
The next UI owner must preserve the frozen selection/patch/nonce through unknown
outcomes and tab changes, retire all financial bodies on privacy boundaries, and
clearly distinguish loaded checked rows from all captured matching rows.

Cloud7277tests/393files/matchingJUnit,0failed/skipped/todo;
all7173parent cases retained+104. Lint/build exit0. Chromium15/15
preserves every prior browser case, real Express/SQLite, integrityOK, original
legacy data, normal shutdown/closed handles and zero external attempts. It covers
existing workflows on explicit schema5, not the unimplemented bulk UI. Build
bytes match the run. Initial membership-order and native-trigger fixture issues
were corrected without weakening assertions. Decoder TypeScript errors were
fixed after stopping an early full run (exit143, not pass); final source was
frozen after lint0 before qualification.

[Proof](evidence/w06-bulk-foundation-development.json),
[full JUnit](evidence/w06-bulk-foundation-cloud.junit.xml.gz),
[full Cloud log](evidence/w06-bulk-foundation-cloud.log.gz),
[preserved browser cases](evidence/w06-bulk-foundation-browser.junit.xml).
Author inspection of27paths is not independent whole-branch review. PR URL/CI run
URL:none; backup branch `codex/feature-first-acceptance`. Dependencies, lockfile and
workflows are unchanged. Windows2022/Node22/other engines/touch/package/service,
100000-row performance and actual Server2019R02 are unrun for current source.
No release/tag/VPS action occurred.

Continue selection/bulk UI and new functional browser journeys, saved preferences,
live receipt apply/remediation/raw legacy backup/legacy bridge/cutover/retention,
remaining Wallet/M1/I02/I03/master work, then independent final branch review and
batched exact-HEAD Windows qualification. This checkpoint completes server/SDK
bulk foundations, not W02/W03/W04/W06 or the full plan.
