# Personal transaction templates — W07 core

Source `212e1a3d016e4525d1b12b5c0d63c2c848068ba0` adds owned template create/edit/archive/restore, draft-only
instantiation, internal HTTP/SDK and a personal UI within Wallet Records.
Wallet stays off by default. No schema/dependency/lockfile/workflow change,
automatic upgrade/activation, release/tag or VPS access is introduced.

Only the current adult owner can read or edit a template; Admin has no override.
List/write/replay responses contain compact metadata. Full reads recheck current
account authority, while new draft assignments require current writable, active
accounts and available category/label choices. Hidden or archived historical
configuration can be retired without exposing its financial body. Catalog delete
refuses protected template references without leaking owner, title or counts.

Instantiation creates a new local date/time with uncleared/unreviewed defaults,
retaining editable labels, exact splits, fee and historical FX defaults. It
creates no posting, record, source identity or nonce. Explicit financial Save
creates the new record. Template writes use existing I01 revision/nonce ownership,
one atomic audit transaction, owner-only aftercommit notification, no-op semantics
and rollback on native failure. Audit uses title/draft digests rather than money
or payee bodies. Bounded per-owner storage and strict SDK DTOs reject malformed
or foreign identities. Standalone8 roundtrips preserve owned configuration.

The existing session owner retains unknown template body/key across navigation
and explicit retry. Cancel/generation retires late readonly responses; later
source/grant changes retire open financial drafts. Replacement requires explicit
confirmation and cannot discard an unknown financial command. FancySelect,
useConfirm, modal focus, theme and vi/en/zh follow existing application patterns.

Cloud **7580 tests/418 files**, matching full JUnit,
zero failed/skipped/todo; all7531 parent identities plus49
retained. Lint/build exit0. Chromium **31/31**, all28 parent cases plus template
creation/application with exact labels/splits, lost-ack same-key retry and private
archive/restore. Real isolated Express/SQLite reports integrityOK, Finance legacy
retained, normal stop/closed handles, zero external calls and matching build bytes.

First browser run29/31 failed in two new test helpers before Save: DOM showed the
existing account button label was “Tài khoản ghi chép”, not the shorter label
those helpers requested. Only their label arguments changed; all assertions,
financial checks, deadlines and retry policy remain. The first failed JUnit,
DOM/trace/screenshot hashes are retained. Initial TypeScript parse typing was
also corrected before qualification. No assertions or tests were skipped.

[Proof](evidence/w07-templates-development.json),
[full JUnit](evidence/w07-templates-cloud.junit.xml.gz),
[full log](evidence/w07-templates-cloud.log.gz),
[browser JUnit](evidence/w07-templates-browser.junit.xml),
[first failed browser JUnit](evidence/w07-templates-browser-first.junit.xml).
Frozen source hashes bind all20 paths to committed blobs. Author inspection is
not final independent whole-branch review. PR URL/CI run URL:none; backup branch
`codex/feature-first-acceptance`. Current Windows2022/Node22, other engines/touch,
large performance/package/service and actual Server2019R02 are unrun.

Core W07 flows now exist; mandatory canonical legacy category/write bridge and
cutover remain before activation. Next:W08 reports, remaining Wallet/M1/I02/I03/
master, protected restore host/Admin binding, remediation/raw backup/retention,
then independent final review and batched Windows. The whole plan is incomplete.
