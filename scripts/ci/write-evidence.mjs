import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

fs.mkdirSync('reports', { recursive: true });
const errors = [];
const checks = Object.fromEntries(['install', 'native', 'lint', 'test', 'build', 'production'].map(name => [name, process.env[`CHECK_${name.toUpperCase()}`] || 'missing']));
for (const [name, outcome] of Object.entries(checks)) {
  if (outcome !== 'success') errors.push(`${name}: ${outcome}`);
  const exitPath = `reports/${name}-exit.json`;
  if (!fs.existsSync(exitPath) || JSON.parse(fs.readFileSync(exitPath, 'utf8')).exitCode !== 0) errors.push(`${name}: missing or nonzero exit evidence`);
}
const readReport = name => {
  try { return JSON.parse(fs.readFileSync(`reports/${name}`, 'utf8')); }
  catch { errors.push(`${name}: missing or invalid report`); return null; }
};
const tests = readReport('vitest.json');
const native = readReport('native.json');
const toolchain = readReport('toolchain.json');
const production = readReport('production.json');
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
  'server/objectAclHttp.test.ts', 'server/mediaHttp.test.ts', 'server/mediaMetadata.test.ts', 'tests/media-cold-restore.test.ts', 'src/utils/mediaResource.test.ts', 'tests/ui/authenticated-media.test.ts', 'tests/compiled-media-policy.test.ts', 'server/taskPayload.test.ts', 'server/taskPayloadHttp.test.ts', 'tests/ui/task-reward-policy.test.ts', 'server/contentPayload.test.ts', 'server/contentPayloadHttp.test.ts', 'tests/ui/note-sharing-policy.test.ts',
  'server/realtime.test.ts', 'server/realtimeHttp.test.ts', 'server/legacyVisibility.test.ts', 'src/utils/realtimeClient.test.ts', 'tests/ui/realtime-session.test.ts',
  'server/icsFeed.test.ts', 'server/updater.test.ts', 'server/sqlite.test.ts',
  'server/appStore.test.ts', 'server/appMigrations.test.ts', 'server/rewardStore.test.ts', 'server/commandHttp.test.ts',
  'server/jobStore.test.ts', 'server/appJobs.durable.test.ts', 'server/pushOutbox.test.ts', 'server/pushDelivery.test.ts', 'server/providerJobs.test.ts', 'server/pushTransport.test.ts', 'server/auth.test.ts', 'server/authStore.test.ts', 'server/authHttp.test.ts', 'src/utils/clientSession.test.ts', 'src/utils/sessionBoundary.test.ts', 'src/utils/privateStorage.test.ts', 'src/utils/privacyWorker.test.ts', 'src/utils/serviceWorkerWatch.test.ts', 'tests/sw-cache.test.ts', 'tests/ui/session-bootstrap.test.ts', 'tests/ui/session-actions.test.ts', 'src/utils/uploadImage.test.ts', 'src/utils/pdfExport.test.ts', 'server/appSnapshot.test.ts', 'server/fullBackup.test.ts', 'tests/snapshot-recovery.test.ts', 'tests/snapshot-http.test.ts',
  'src/utils/assetValue.test.ts', 'src/utils/bmi.test.ts', 'src/utils/debt.test.ts',
  'src/utils/financePeriod.test.ts', 'src/utils/recurrence.test.ts',
  'src/utils/searchText.test.ts', 'src/utils/vietnamHolidays.test.ts', 'tests/evidence.test.ts',
  'server/config.test.ts', 'tests/data-migration.test.ts', 'tests/native-scripts.test.ts',
  'tests/native-paths.test.ts', 'tests/native-gc.test.ts',
  'server/app.test.ts', 'server/lifecycle.test.ts', 'server/appJobs.test.ts',
  'server/appEffects.test.ts', 'server/systemMetrics.test.ts', 'tests/runtime-process.test.ts', 'tests/ui/windows-version.test.tsx', 'tests/runtime-ownership.test.ts',
];
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
if (production?.commitSha !== commitSha || production?.nodeVersion !== process.version || production?.platform !== 'win32' || production?.architecture !== 'x64' || !Array.isArray(production?.checks)) errors.push('production startup evidence missing or contradicts tested runtime/SHA');
for (const check of ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets', 'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery', 'auth-session-restart', 'auth-session-logout', 'private-response-cache', 'authenticated-realtime', 'object-visibility', 'authenticated-media', 'task-write-authority', 'content-write-authority']) {
  if (!production?.checks?.includes(check)) errors.push(`production probe check missing: ${check}`);
}
if (process.version !== `v${process.env.EXPECTED_NODE}` || npmVersion !== process.env.EXPECTED_NPM) errors.push('Node/npm differs from pinned toolchain');
if (toolchain?.visualStudioVersion !== process.env.EXPECTED_VS) errors.push('builder differs from validated Visual Studio toolchain');
if (process.platform !== 'win32' || process.arch !== 'x64') errors.push('runner is not Windows x64');
const evidence = {
  commitSha, workflowRunUrl: process.env.WORKFLOW_RUN_URL, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  runnerOS: `${os.type()} ${os.release()}`, runnerImage: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion, nodeVersion: process.version, npmVersion, toolchain,
  checks, suites, native, production, server2019Acceptance: 'not-run', errors,
};
fs.writeFileSync('reports/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (errors.length) process.exitCode = 1;
