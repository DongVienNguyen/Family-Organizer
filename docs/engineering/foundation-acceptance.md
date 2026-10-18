# Windows foundation acceptance — F09

The complete master plan is **not finished**. This document distinguishes the
implemented Windows foundation from external acceptance gates. The latest exact
commit, PR, CI run and independently verified raw reports are recorded in
[test-evidence.json](test-evidence.json) and
[implementation-status.md](implementation-status.md). A source draft or Cloud run
is not Windows acceptance; a build is not the aggregate test result.

| Foundation task | Implemented evidence and limits |
| --- | --- |
| F01 | Exact Node22 baseline/Node24 target, npm/addon/tool pins; actual Windows compatibility and native allocation/GC regressions. Historical addon11 failure retained; target is addon13.0.3 N-API |
| F02 | Absolute external roots, Unicode/spaces/System32 startup, denied-write failure, explicit legacy copier/dry-run/source preservation, native scripts and production-only ZIP |
| F03 | Explicit app/runtime/storage/job lifecycle; request/effect drain and SQLite close, readiness/maintenance/crash recovery, native metrics. App deployment/restart/Immich management intentionally retired |
| I01 | Single write gateway, legacy dirty collection adapter, domain migration/checksum registry, commands/transaction dedupe, durable job leases and one shared snapshot/restore journal |
| F04 | Expiring/revocable sessions, roles/object/media ACL, field/body limits, server-side derived privacy, actor-owned requests/cache purge, ordinary credential exclusion and selective encrypted recovery. Offline providers only |
| F05 | Seven mandatory Windows2022 jobs, strict JSON/JUnit/coverage/source/native gates, first-attempt three-engine browser cases and raw artifact readers. **Owner configured enforcement: REST verifies main protected, required ci-gate from GitHub Actions/app15368 for everyone. Owner explicitly confirms PR, up-to-date and no bypass; detailed Administration reads remain403** |
| F06 | Same immutable Windows ZIP built/tested across independent clean producer/consumer, bundled runtime/addon, source/schema/file/license manifest and hostile archive refusal. Cloud node_modules never packaged |
| F07 | Actual disposable Windows service/LocalService SID/ACL/ownership, graceful stops/restarts/crash recovery, native file-lock release, encrypted online/offline backup, guarded restore/update/rollback and scheduled retention. Actual reboot/off-host destination/RPO/RTO remain R02 |
| F08 | Trusted-main explicit source/run authentication, all raw report families and original ZIP/native/license binding, normalized full evidence and read-only candidate/promotion handoff. Publication remains blocked; no release/tag has been created |
| F09 | Legacy feature ownership and current route inventory below; focused browser/HTTP regression slices. Final PR66 HEAD cd2a704e8dbdfe169c56c7b06cb92469f641ea4e/CI38444771190 independently passes all7 checks/eight raw readers, both2835/139 and45 first-attempt browser cases. Squash d59193b81fcd58febad4601f847b820bad4b802a has the same tree |

## Existing feature regression owners

Each row identifies concrete regression boundaries. It does not claim exhaustive
coverage of every button, field or external service. The machine-readable
[current route inventory](windows-current-route-inventory.json) records literal
routes and mapped suite hashes; the original baseline inventory stays historical.

| Existing feature | Regression boundary / owner |
| --- | --- |
| Login/profile/settings | B01/B05/B09; authHttp, objectAclHttp, clientSession/sessionBoundary, native account initialization and legacyFlagsHttp |
| Tasks/approval/rewards | B08 actual child submit → adult approval → persisted points; taskPayloadHttp/commandHttp/rewardStore, duplicate command and snapshot invariants |
| Calendar | B12 recurring create/grid/agenda/real client ICS bytes and B15 private edit/reload/Child boundaries; legacyCalendarHttp and recurrence helpers. Subscription feed is read-only |
| Notes/media/search | B03/B13; contentPayloadHttp/objectAclHttp/mediaHttp; Markdown/private visibility and authenticated media. Child direct-URL smoke has the recorded deferred heading-only coverage limitation |
| Finance/assets/budget/bills/goals/debt | B07 actual create/edit/delete/reload/PDF; legacyFinanceHttp and finance/asset/debt helpers characterize existing contracts. B14 checks authorized monthly dashboard balance/drilldown |
| Shopping/meal/assistant | B06/B10; shoppingHttp/shoppingPersistence/legacyAiHttp; actual unconfigured refusal and offline provider drafts/errors, loading/close/focus, persistence and no automatic writes |
| Growth/vaccination/medication/documents | B11/B13; legacyHealthHttp/objectAclHttp/contentPayloadHttp; growth/BMI, taken/skipped/clear dose log, document create/edit/reload and role boundaries |
| Notifications/PWA/realtime | B04/B05/B09/B14; derivedPrivacyHttp/pushTransport/pushDelivery/realtimeHttp and privacy/storage/session tests. Stored notices and offline delivery fixtures only |
| Dashboard/weather/market/digest | B14 and browser provider fixtures; derivedPrivacyHttp/weeklyDigestPrivacy/weeklyDigestHttp. No real market/weather/AI/Telegram endpoint acceptance is claimed |
| Server/version/external links | app/systemMetrics/runtime-process/windows-version suites and service/package probes; native data-root metrics and operator-managed version information |
| Import/export/backup/restore | data-migration/fullBackup/appSnapshot/snapshot-http/snapshot-recovery; package/service recovery probes. Synthetic IDs/tasks/points/finance/media/settings, source preservation, journal interruption, schema/refusal and credential policy |
| Theme/i18n/browser platform | Browser locale/reduced-motion/shared UI across Chromium/Firefox/WebKit; existing styles retained. Real device speech, HEIC capture, mobile OS push delivery and every visual state remain unrun |

New Matrix/Kanban/Wallet flags are absent. The existing rewards settings route
ignores those unrelated keys; the regression verifies no legacy/settings mutation.
This is not a new integration API or rollout implementation. Future module flags
and feature migrations belong to P/W after foundation acceptance.

The native45s calendar failure was retained and its long case split into B12/B15 with B12 realUI creation and B15 real authenticated API fixture setup. Every original assertion remains; editing immediately after export/detail navigation in one continuous session is no longer tested. All other flows, normal actionability,45s cases/10s expectations and zero retries remain.

Deferred Minor review findings remain in per-task rulings. They include historical
negative-fixture counts, isolated B14 zero-unread badge text, a Child direct-URL
heading-only check, old collector preflight log wording and native junction race
scope. Current required assertions, zero retries/skips and evidence budgets remain
unchanged. Snapshot assertions explicitly distinguish legacy rows from every
internal auth/command table.

## Remaining gates

1. Foundation source accepted at final PR66 HEAD/CI above; preserve all original failures and raw bytes. New source/documentation HEADs require their own CI before merge.
2. F05 enforcement is configured by owner: see [evidence](evidence/f05-owner-enforcement.json). Branch protected/required Actions ci-gate/everyone are API-observed; PR, up-to-date and no-bypass settings are owner-confirmed. Detailed Administration read/write remains403; this limitation does not undo owner-configured protection.
3. Continue P01–P18/W01–W18/I02–I03 in dependency order. P01 introduces pure contracts/helpers only; P02 owns task migration and compatibility. R01 additionally requires complete feature/performance/migration evidence.
4. R02 requires actual Windows Server2019 x64/build17763, package/hash provenance,
   reboot/TLS/proxy/restore/load and measured off-host RPO/RTO on authorized staging.
   Windows2022 evidence cannot satisfy it.
5. Release/tag creation and VPS access/deployment remain unauthorized. Read-only
   handoff preparation does not grant those permissions or create approval evidence.

See [Windows operations draft](windows-operations.md) for the existing operator
contracts. This file does not certify Internet readiness or production acceptance.
