import {validateReleaseInnerExtractionNative} from '../windows/release-inner-package.mjs';
import {validateNodeSdkReceipt} from './node-sdk-policy.mjs';
import {validateReleaseReportExtractionNative} from '../windows/release-report-extraction.mjs';
import {validateCaddyNativeEvidence} from '../windows/caddy-contract.mjs';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';

fs.mkdirSync('reports', { recursive: true });
const errors = [];
const checks = Object.fromEntries(['install', 'native', 'lint', 'test', 'build', 'production','audit','coverage'].map(name => [name, process.env[`CHECK_${name.toUpperCase()}`] || 'missing']));
for (const [name, outcome] of Object.entries(checks)) {
  if (outcome !== 'success') errors.push(`${name}: ${outcome}`);
  const exitPath = `reports/${name}-exit.json`;
  const exitReport = fs.existsSync(exitPath) ? JSON.parse(fs.readFileSync(exitPath, 'utf8')) : null;
  if (exitReport?.exitCode !== 0) errors.push(`${name}: missing or nonzero exit evidence`);
  if (name === 'audit' && exitReport?.nativeAuditExitCode !== 0) errors.push('audit: missing or nonzero native exit evidence');
  if (name === 'coverage' && exitReport?.nativeCoverageExitCode !== 0) errors.push('coverage: missing or nonzero native exit evidence');
}
const readReport = name => {
  try { return JSON.parse(fs.readFileSync(`reports/${name}`, 'utf8')); }
  catch { errors.push(`${name}: missing or invalid report`); return null; }
};
const tests = readReport('vitest.json');
const native = readReport('native.json');
const nodeSdk=readReport('node-sdk.json');
const releaseInnerExtraction=readReport('release-inner-extraction-native.json');
const releaseReportExtraction=readReport('release-report-extraction-native.json');
const caddy={probe:readReport('caddy-native.json'),exit:readReport('caddy-exit.json')};
const toolchain = readReport('toolchain.json');
const production = readReport('production.json');
const audit=readReport('audit.json');
const auditContext=readReport('audit-context.json');
const coverage=readReport('coverage-evidence.json');
const npmVersion = toolchain?.npmVersion;
const cwd = process.cwd().replaceAll('\\', '/');
const suites = (tests?.testResults || []).map(suite => ({
  name: suite.name.replaceAll('\\', '/').replace(`${cwd}/`, ''),
  passed: suite.assertionResults.filter(test => test.status === 'passed').length,
  failed: suite.assertionResults.filter(test => test.status === 'failed').length,
  skipped: suite.assertionResults.filter(test => test.status !== 'passed' && test.status !== 'failed').length,
}));
if (!tests?.success || !(tests.numTotalTests > 0) || tests.numPassedTests !== tests.numTotalTests || suites.length === 0) errors.push('test run failed, skipped tests, or zero tests');
const requiredSuites = [
  'src/features/wallet/money.test.ts', 'src/features/wallet/dates.test.ts', 'src/features/wallet/filter.test.ts',
  'tests/release-inner-package.test.ts', 'tests/release-inner-extraction.test.ts', 'tests/release-inner-native.test.ts', 'tests/release-auxiliary-reports.test.ts', 'tests/release-harness-build.test.ts', 'tests/release-service-reports.test.ts', 'tests/release-consumer-reports.test.ts', 'tests/release-package-reports.test.ts', 'tests/release-browser-files.test.ts', 'tests/release-runtime-reports.test.ts', 'tests/release-runtime-files.test.ts', 'tests/release-coverage-files.test.ts', 'tests/sdk-transfer-retry.test.ts', 'tests/node-sdk-policy.test.ts', 'tests/release-report-files.test.ts', 'tests/release-quality-files.test.ts', 'tests/release-report-extraction.test.ts', 'tests/release-quality-reports.test.ts', 'tests/release-source-policy.test.ts', 'tests/caddy-native-policy.test.ts', 'tests/caddy-native-evidence.test.ts', 'tests/caddy-failure-diagnostics.test.ts', 'server/legacyFinanceHttp.test.ts', 'server/shoppingPersistence.test.ts', 'server/shoppingHttp.test.ts', 'tests/release-metadata.test.ts', 'tests/release-archives.test.ts', 'tests/release-evidence.test.ts', 'server/updateFence.test.ts', 'tests/update-startup.test.ts', 'server/updateInspection.test.ts', 'tests/update-journal.test.ts', 'server/recoveryRetention.test.ts', 'tests/recovery-maintenance-operator.test.ts', 'tests/online-recovery.test.ts', 'server/recoverySchedule.test.ts', 'server/recoverySchedule.jobs.test.ts', 'tests/scheduled-recovery.test.ts', 'tests/coverage-evidence.test.ts', 'tests/coverage-input.test.ts', 'server/sqliteCompatibility.test.ts', 'tests/windows-package.test.ts', 'tests/package-licenses.test.ts', 'tests/windows-service.test.ts',
  'server/legacyHealthHttp.test.ts',
  'tests/browser-evidence.test.ts', 'tests/browser-providers.test.ts',
  'server/objectAclHttp.test.ts', 'server/mediaHttp.test.ts', 'server/mediaMetadata.test.ts', 'tests/media-cold-restore.test.ts', 'src/utils/mediaResource.test.ts', 'tests/ui/authenticated-media.test.ts', 'tests/compiled-media-policy.test.ts', 'server/taskPayload.test.ts', 'server/taskPayloadHttp.test.ts', 'tests/ui/task-reward-policy.test.ts', 'server/derivedPrivacyHttp.test.ts', 'server/derivedPrivacyNative.test.ts', 'server/contentPayload.test.ts', 'server/contentPayloadHttp.test.ts', 'tests/ui/note-sharing-policy.test.ts',
  'server/realtime.test.ts', 'server/realtimeHttp.test.ts', 'server/legacyVisibility.test.ts', 'src/utils/realtimeClient.test.ts', 'tests/ui/realtime-session.test.ts',
  'server/weeklyDigestPrivacy.test.ts','server/weeklyDigestHttp.test.ts', 'tests/librarySecurity.test.ts', 'tests/account-initialization.test.ts', 'tests/httpDependencySecurity.test.ts', 'server/icsFeed.test.ts', 'server/updater.test.ts', 'server/sqlite.test.ts',
  'server/appStore.test.ts', 'server/appMigrations.test.ts', 'server/rewardStore.test.ts', 'server/commandHttp.test.ts',
  'server/jobStore.test.ts', 'server/appJobs.durable.test.ts', 'server/pushOutbox.test.ts', 'server/pushDelivery.test.ts', 'server/providerJobs.test.ts', 'server/pushTransport.test.ts', 'server/auth.test.ts', 'server/authStore.test.ts', 'server/authHttp.test.ts', 'src/utils/clientSession.test.ts', 'src/utils/sessionBoundary.test.ts', 'src/utils/privateStorage.test.ts', 'src/utils/privacyWorker.test.ts', 'src/utils/serviceWorkerWatch.test.ts', 'tests/sw-cache.test.ts', 'tests/ui/session-bootstrap.test.ts', 'tests/ui/session-actions.test.ts', 'src/utils/uploadImage.test.ts', 'src/utils/pdfExport.test.ts', 'server/backupCredentials.test.ts', 'server/recoveryEnvelope.test.ts', 'server/recoverySettings.test.ts', 'server/recoveryFiles.test.ts', 'server/recoveryEnv.test.ts', 'tests/recovery-operator.test.ts', 'server/appSnapshot.test.ts', 'server/fullBackup.test.ts', 'tests/snapshot-recovery.test.ts', 'tests/snapshot-http.test.ts',
  'src/utils/assetValue.test.ts', 'src/utils/bmi.test.ts', 'src/utils/pushSubscription.test.ts', 'src/utils/debt.test.ts',
  'src/utils/financePeriod.test.ts', 'src/utils/recurrence.test.ts',
  'src/utils/searchText.test.ts', 'src/utils/vietnamHolidays.test.ts', 'tests/evidence.test.ts',
  'server/config.test.ts', 'tests/data-migration.test.ts', 'tests/native-scripts.test.ts',
  'tests/native-paths.test.ts', 'tests/native-gc.test.ts',
  'server/app.test.ts', 'server/lifecycle.test.ts', 'server/appJobs.test.ts',
  'server/appEffects.test.ts', 'server/systemMetrics.test.ts', 'tests/runtime-process.test.ts', 'tests/ui/windows-version.test.tsx', 'tests/runtime-ownership.test.ts',

  'tests/browser-protocol.test.ts',
  'server/legacyCalendarHttp.test.ts',
  'server/legacyAiHttp.test.ts',
  'tests/release-collector-evidence.test.ts',
  'src/utils/assistantFocus.test.ts',
  'tests/release-candidate-handoff.test.ts',
  'src/utils/notificationRead.test.ts', 'server/legacyFlagsHttp.test.ts',
  'src/features/productivity/dates.test.ts', 'src/features/productivity/filters.test.ts', 'src/features/productivity/contracts.test.ts',
  'server/productivity/migration.test.ts', 'server/productivity/store.test.ts',
  'server/productivity/rank.test.ts', 'server/productivity/board.test.ts','server/productivity/grouping.test.ts','src/features/productivity/group-view-format.test.ts','server/productivity/group-view-schema.test.ts','server/productivity/tag-groups.test.ts','server/productivity/tag-group-moves.test.ts','server/productivity/tag-groups.api.test.ts','tests/group-view-native.test.ts','server/productivity/grouped-board.test.ts','server/productivity/grouped-board.api.test.ts','server/productivity/grouped-board-moves.test.ts','server/productivity/grouped-board-moves.api.test.ts',
  'server/productivity/completion-characterization.test.ts','server/productivity/completion-reversal.test.ts','server/productivity/completion-reversal.api.test.ts','server/productivity/completion-claims-snapshot.test.ts','tests/completion-recovery-native.test.ts','tests/completion-import.test.ts','server/productivity/completion-reversal-board.test.ts','server/productivity/completion.test.ts','server/productivity/completion.api.test.ts','server/productivity/clock.test.ts','server/productivity/board-storage.test.ts', 'server/productivity/board-writers.test.ts', 'server/productivity/board-upgrade.test.ts','tests/board-recovery-native.test.ts', 'server/productivity/board-catalog.test.ts','server/productivity/board-catalog.api.test.ts', 'server/productivity/board-reference.test.ts','server/productivity/board-reference.api.test.ts','tests/board-reference-native.test.ts', 'tests/board-package-evidence.test.ts','tests/board-package-fixture.test.ts', 'server/productivity/board-projection.test.ts','server/productivity/board-projection.api.test.ts', 'server/productivity/board-layout.test.ts','server/productivity/board-layout.api.test.ts','server/productivity/board-moves.test.ts','server/productivity/board-moves.api.test.ts','server/productivity/board-wip-override.test.ts', 'server/productivity/adapter.test.ts', 'server/productivity/activation.test.ts', 'server/productivity/bridge-order.test.ts', 'server/productivity/legacy-characterization.test.ts', 'server/productivity/access.test.ts', 'server/productivity/tasks.test.ts', 'server/productivity/access.api.test.ts', 'server/productivity/activation-grants.test.ts', 'server/productivity/structure.test.ts', 'server/productivity/structure-schema.test.ts', 'server/productivity/structure-v1.test.ts', 'server/productivity/structure-upgrade.test.ts', 'server/productivity/structure.api.test.ts', 'server/productivity/tag-ownership.test.ts', 'server/productivity/tag-upgrade.test.ts', 'src/utils/taskTagLabels.test.ts','src/features/productivity/editor.test.ts','src/features/productivity/taskCache.test.ts','src/features/productivity/api.test.ts','server/productivity/pins.test.ts','server/productivity/subtasks.test.ts','server/productivity/pin-upgrade.test.ts','tests/productivity-browser-evidence.test.ts','server/productivity/query.test.ts','server/wallet/store.test.ts','server/wallet/snapshot.test.ts','server/productivity/views.test.ts','server/productivity/search.test.ts','server/productivity/view-upgrade.test.ts','server/wallet/integration.test.ts','server/wallet/coexistence.test.ts','server/productivity/views.api.test.ts','src/features/productivity/query-api.test.ts','src/features/productivity/matrix.test.ts','server/productivity/matrix-upgrade.test.ts','server/productivity/matrix.test.ts','server/productivity/matrix.api.test.ts','src/features/productivity/matrixClient.test.ts','src/features/productivity/matrixState.test.ts','src/features/productivity/drag.test.ts','src/features/productivity/matrixRulePreview.test.ts','src/features/productivity/matrix-ui.test.tsx','src/features/productivity/ruleEditing.test.ts','server/productivity/query-capacity.test.ts','src/features/productivity/queryState.test.ts','src/features/productivity/globalTaskSearch.test.ts','src/features/productivity/savedViewDraft.test.ts','src/features/productivity/openTask.test.ts',];
for (const required of requiredSuites) {
  if (!suites.some(suite => suite.name === required)) errors.push(`required suite missing: ${required}`);
}
for (const suite of suites) {
  if (!(suite.passed > 0) || suite.failed !== 0 || suite.skipped !== 0) errors.push(`empty, failed or skipped suite: ${suite.name}`);
}
const passedAssertions = suites.reduce((sum, suite) => sum + suite.passed, 0);
if (passedAssertions !== tests?.numTotalTests || tests?.numFailedTests !== 0 || tests?.numPendingTests !== 0 || tests?.numTodoTests !== 0) errors.push('suite assertions contradict aggregate test totals');
if (!native || native.nodeVersion !== process.version || native.nodeABI !== process.versions.modules ||
    native.platform !== 'win32' || native.architecture !== 'x64' || native.addonVersion !== process.env.EXPECTED_SQLITE_ADDON ||
    !/^\d+\.\d+\.\d+$/.test(native.sqliteVersion || '') || !/^[a-f0-9]{64}$/.test(native.binarySha256 || '') ||
    !Array.isArray(native.checks)) {
  errors.push('native report contradicts runtime/addon or has invalid version/hash');
}
for (const check of ['native-load', 'write-read', 'transaction-rollback', 'WAL-backup', 'integrity-check', 'file-cleanup']) {
  if (!native?.checks?.includes(check)) errors.push(`native probe check missing: ${check}`);
}
if (!fs.existsSync('reports/junit.xml') || !fs.readFileSync('reports/junit.xml', 'utf8').includes('<testcase')) errors.push('JUnit test cases missing');
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commitSha !== process.env.TEST_COMMIT_SHA) errors.push('checkout SHA differs from requested HEAD');
errors.push(...validateNodeSdkReceipt(nodeSdk,{commitSha,nodeVersion:process.version}));
errors.push(...validateReleaseInnerExtractionNative(releaseInnerExtraction,{commitSha,nodeVersion:process.version}));
errors.push(...validateReleaseReportExtractionNative(releaseReportExtraction,{commitSha,nodeVersion:process.version}));
errors.push(...validateCaddyNativeEvidence(caddy,{commitSha,nodeVersion:process.version}));
const lockSha256=createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex');
try {
  const policyBytes = fs.readFileSync('docs/engineering/evidence/windows-coverage-baseline.json');
  const policy = JSON.parse(policyBytes);
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const floor = policy.floors?.[process.version];
  if (policy.schema !== 1 || policy.providerVersion !== '4.1.11' || !floor) throw new Error('unmeasured coverage policy');
  if (coverage?.commitSha !== commitSha || coverage?.nodeVersion !== process.version || coverage?.platform !== 'win32' || coverage?.architecture !== 'x64' || coverage?.providerVersion !== policy.providerVersion || coverage?.lockSha256 !== lockSha256 || coverage?.baselineSha256 !== createHash('sha256').update(policyBytes).digest('hex')) errors.push('coverage context differs from tested HEAD/runtime/lockfile/policy');
  if (!Array.isArray(coverage?.errors) || coverage.errors.length !== 0) errors.push('coverage validation errors remain');
  const inventory = coverage?.sourceInventory;
  if (!Array.isArray(inventory) || inventory.length === 0 || inventory.some(item => typeof item?.path !== 'string' || !/^(src|server)\/.+\.tsx?$/.test(item.path) || !/^[a-f0-9]{64}$/.test(item?.sha256 || '')) || new Set(inventory.map(item => item.path)).size !== inventory.length || coverage?.sourceInventorySha256 !== createHash('sha256').update(JSON.stringify(inventory)).digest('hex')) errors.push('coverage inventory is empty, invalid or changed');
  for (const name of metrics) {
    const metric = coverage?.total?.[name];
    if (typeof floor[name] !== 'number' || floor[name] < 0 || floor[name] > 100 || coverage?.floor?.[name] !== floor[name] || !Number.isInteger(metric?.total) || metric.total <= 0 || !Number.isInteger(metric?.covered) || metric.covered < 0 || metric.covered > metric.total || metric.skipped !== 0 || typeof metric.pct !== 'number' || metric.pct < floor[name] || metric.pct > 100) errors.push(`coverage ${name} differs from measured floor or has invalid counters`);
  }
  for (const name of ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'index.html']) {
    const reportPath = `reports/coverage/${name}`;
    const recordedHash = coverage?.reportHashes?.[name];
    if (!/^[a-f0-9]{64}$/.test(recordedHash || '') || !fs.existsSync(reportPath) || createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex') !== recordedHash) errors.push(`coverage report missing or changed: ${name}`);
  }
} catch (error) { errors.push(`coverage policy/reports invalid: ${error.message}`); }
if(!audit||audit.error||!audit.vulnerabilities||typeof audit.vulnerabilities!=='object'||Array.isArray(audit.vulnerabilities)||Object.keys(audit.vulnerabilities).length!==0||!['info','low','moderate','high','critical','total'].every(name=>audit.metadata?.vulnerabilities?.[name]===0))errors.push('dependency audit missing, invalid, or contains remaining vulnerabilities');
if(auditContext?.commitSha!==commitSha||auditContext?.nodeVersion!==process.version||auditContext?.platform!=='win32'||auditContext?.architecture!=='x64'||auditContext?.lockSha256!==lockSha256)errors.push('dependency audit context differs from tested HEAD/runtime/lockfile');
if (production?.commitSha !== commitSha || production?.nodeVersion !== process.version || production?.platform !== 'win32' || production?.architecture !== 'x64' || !Array.isArray(production?.checks)) errors.push('production startup evidence missing or contradicts tested runtime/SHA');
const incompatibleNames = ['future', 'missing-version', 'foreign', 'sqliteX', 'sqliteData', 'malformed-metadata', 'malformed-owned-table'];
const incompatibleCases = production?.incompatibleSchemas;
if (!Array.isArray(incompatibleCases) || incompatibleCases.length !== incompatibleNames.length || incompatibleNames.some(name => incompatibleCases.filter(item => item?.name === name).length !== 1) || incompatibleCases.some(item => item?.exitCode !== 1 || item.bytesSchemaRowsJournalPreserved !== true || item.nativeHandlesReleased !== true || item.journal !== 'delete' || typeof item.databaseSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.databaseSha256) || !Array.isArray(item.networkAttempts) || item.networkAttempts.length !== 0)) errors.push('compiled incompatible-schema preservation evidence missing or contradictory');
for (const check of ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets', 'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery', 'auth-session-restart', 'auth-session-logout', 'private-response-cache', 'authenticated-realtime', 'object-visibility', 'authenticated-media', 'task-write-authority', 'content-write-authority', 'derived-object-privacy', 'explicit-first-account','provider-digest-privacy','incompatible-schema-preserved']) {
  if (!production?.checks?.includes(check)) errors.push(`production probe check missing: ${check}`);
}
if (process.version !== `v${process.env.EXPECTED_NODE}` || npmVersion !== process.env.EXPECTED_NPM) errors.push('Node/npm differs from pinned toolchain');
if (toolchain?.visualStudioVersion !== process.env.EXPECTED_VS) errors.push('builder differs from validated Visual Studio toolchain');
if (process.platform !== 'win32' || process.arch !== 'x64') errors.push('runner is not Windows x64');
const evidence = {
  commitSha, workflowRunUrl: process.env.WORKFLOW_RUN_URL, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  runnerOS: `${os.type()} ${os.release()}`, runnerImage: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion, nodeVersion: process.version, npmVersion, toolchain,
  checks, suites, native, nodeSdk, caddy, releaseReportExtraction, releaseInnerExtraction, production, audit, auditContext, coverage, lockSha256, server2019Acceptance: 'not-run', errors,
};
fs.writeFileSync('reports/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (errors.length) process.exitCode = 1;
