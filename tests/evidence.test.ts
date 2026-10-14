import {validateReleaseInnerExtractionNative} from '../scripts/windows/release-inner-package.mjs';
import {validateNodeSdkReceipt} from '../scripts/ci/node-sdk-policy.mjs';
import {validateReleaseReportExtractionNative} from '../scripts/windows/release-report-extraction.mjs';
import {caddyRuntime,validateCaddyNativeEvidence} from '../scripts/windows/caddy-contract.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../scripts/ci/write-evidence.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const sha = '1234567890123456789012345678901234567890';
const lockText='synthetic frozen lockfile';
const lockHash=createHash('sha256').update(lockText).digest('hex');
const coverageFloor={lines:1,statements:1,functions:1,branches:1};
const coveragePolicyText=JSON.stringify({schema:1,providerVersion:'4.1.11',floors:{'v24.21.0':coverageFloor}});
const suiteNames = [
  'server/icsFeed.test.ts', 'src/utils/pushSubscription.test.ts', 'server/updater.test.ts', 'server/sqlite.test.ts', 'server/sqliteCompatibility.test.ts', 'tests/windows-package.test.ts', 'tests/package-licenses.test.ts', 'tests/windows-service.test.ts',
  'src/features/wallet/money.test.ts', 'src/features/wallet/dates.test.ts', 'src/features/wallet/filter.test.ts',
  'tests/coverage-evidence.test.ts', 'tests/coverage-input.test.ts',
  'tests/browser-evidence.test.ts', 'tests/browser-providers.test.ts',
  'server/appStore.test.ts', 'server/appMigrations.test.ts', 'server/rewardStore.test.ts', 'server/commandHttp.test.ts',
  'server/jobStore.test.ts', 'server/appJobs.durable.test.ts', 'server/pushOutbox.test.ts', 'server/pushDelivery.test.ts', 'server/providerJobs.test.ts', 'server/pushTransport.test.ts', 'server/auth.test.ts', 'server/authStore.test.ts', 'server/authHttp.test.ts', 'src/utils/clientSession.test.ts', 'src/utils/sessionBoundary.test.ts', 'src/utils/privateStorage.test.ts', 'src/utils/privacyWorker.test.ts', 'src/utils/serviceWorkerWatch.test.ts', 'tests/sw-cache.test.ts', 'server/realtimeHttp.test.ts', 'server/realtime.test.ts', 'server/legacyVisibility.test.ts', 'src/utils/realtimeClient.test.ts', 'tests/ui/realtime-session.test.ts', 'tests/ui/session-bootstrap.test.ts', 'tests/ui/session-actions.test.ts', 'src/utils/uploadImage.test.ts', 'src/utils/pdfExport.test.ts', 'server/backupCredentials.test.ts', 'server/recoveryEnvelope.test.ts', 'server/recoverySettings.test.ts', 'server/recoveryFiles.test.ts', 'server/recoveryEnv.test.ts', 'tests/recovery-operator.test.ts', 'tests/release-inner-package.test.ts', 'tests/release-inner-extraction.test.ts', 'tests/release-inner-native.test.ts', 'tests/release-auxiliary-reports.test.ts', 'tests/release-harness-build.test.ts', 'tests/release-service-reports.test.ts', 'tests/release-consumer-reports.test.ts', 'tests/release-package-reports.test.ts', 'tests/release-browser-files.test.ts', 'tests/release-runtime-reports.test.ts', 'tests/release-runtime-files.test.ts', 'tests/release-coverage-files.test.ts', 'tests/sdk-transfer-retry.test.ts', 'tests/node-sdk-policy.test.ts', 'tests/release-report-files.test.ts', 'tests/release-quality-files.test.ts', 'tests/release-report-extraction.test.ts', 'tests/release-quality-reports.test.ts', 'tests/release-source-policy.test.ts', 'tests/caddy-native-policy.test.ts', 'tests/caddy-native-evidence.test.ts', 'tests/caddy-failure-diagnostics.test.ts', 'server/legacyFinanceHttp.test.ts', 'server/shoppingPersistence.test.ts', 'server/shoppingHttp.test.ts', 'tests/release-metadata.test.ts', 'tests/release-archives.test.ts', 'tests/release-evidence.test.ts', 'server/updateFence.test.ts', 'tests/update-startup.test.ts', 'server/updateInspection.test.ts', 'tests/update-journal.test.ts', 'server/recoveryRetention.test.ts', 'tests/recovery-maintenance-operator.test.ts', 'tests/online-recovery.test.ts', 'server/recoverySchedule.test.ts', 'server/recoverySchedule.jobs.test.ts', 'tests/scheduled-recovery.test.ts', 'server/appSnapshot.test.ts', 'server/fullBackup.test.ts', 'tests/snapshot-recovery.test.ts', 'tests/snapshot-http.test.ts',
  'server/legacyHealthHttp.test.ts',
  'src/utils/assetValue.test.ts', 'src/utils/bmi.test.ts', 'src/utils/debt.test.ts',
  'src/utils/financePeriod.test.ts', 'src/utils/recurrence.test.ts',
  'src/utils/searchText.test.ts', 'src/utils/vietnamHolidays.test.ts', 'tests/evidence.test.ts',
  'server/config.test.ts', 'tests/data-migration.test.ts', 'tests/native-scripts.test.ts',
  'tests/native-paths.test.ts', 'tests/native-gc.test.ts',
  'server/app.test.ts', 'server/lifecycle.test.ts', 'server/appJobs.test.ts',
  'server/appEffects.test.ts', 'server/systemMetrics.test.ts', 'tests/runtime-process.test.ts', 'tests/ui/windows-version.test.tsx', 'tests/runtime-ownership.test.ts', 'server/objectAclHttp.test.ts', 'server/mediaHttp.test.ts', 'server/mediaMetadata.test.ts', 'tests/media-cold-restore.test.ts', 'src/utils/mediaResource.test.ts', 'tests/ui/authenticated-media.test.ts', 'tests/compiled-media-policy.test.ts', 'server/taskPayload.test.ts', 'server/taskPayloadHttp.test.ts', 'tests/ui/task-reward-policy.test.ts', 'server/contentPayload.test.ts', 'server/contentPayloadHttp.test.ts', 'tests/ui/note-sharing-policy.test.ts', 'server/derivedPrivacyHttp.test.ts', 'server/derivedPrivacyNative.test.ts', 'tests/httpDependencySecurity.test.ts', 'tests/account-initialization.test.ts', 'tests/librarySecurity.test.ts', 'server/weeklyDigestPrivacy.test.ts', 'server/weeklyDigestHttp.test.ts',

  'tests/browser-protocol.test.ts',
  'server/legacyCalendarHttp.test.ts',
  'server/legacyAiHttp.test.ts',
  'tests/release-collector-evidence.test.ts',
  'src/utils/assistantFocus.test.ts',
  'tests/release-candidate-handoff.test.ts',
  'src/utils/notificationRead.test.ts',
  'server/legacyFlagsHttp.test.ts',
  'src/features/productivity/dates.test.ts', 'src/features/productivity/filters.test.ts', 'src/features/productivity/contracts.test.ts',
  'server/productivity/migration.test.ts', 'server/productivity/store.test.ts',
  'server/productivity/adapter.test.ts', 'server/productivity/activation.test.ts', 'server/productivity/bridge-order.test.ts', 'server/productivity/legacy-characterization.test.ts', 'server/productivity/access.test.ts', 'server/productivity/tasks.test.ts', 'server/productivity/access.api.test.ts', 'server/productivity/activation-grants.test.ts', 'server/productivity/structure.test.ts', 'server/productivity/structure-schema.test.ts', 'server/productivity/structure-v1.test.ts', 'server/productivity/structure-upgrade.test.ts', 'server/productivity/structure.api.test.ts', 'server/productivity/tag-ownership.test.ts', 'server/productivity/tag-upgrade.test.ts', 'src/utils/taskTagLabels.test.ts','src/features/productivity/editor.test.ts','src/features/productivity/taskCache.test.ts','src/features/productivity/api.test.ts','server/productivity/pins.test.ts','server/productivity/subtasks.test.ts','server/productivity/pin-upgrade.test.ts','tests/productivity-browser-evidence.test.ts','server/productivity/query.test.ts','server/wallet/store.test.ts','server/wallet/snapshot.test.ts',];
