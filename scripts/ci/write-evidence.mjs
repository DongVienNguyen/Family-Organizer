import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

fs.mkdirSync('reports', { recursive: true });
const errors = [];
const checks = Object.fromEntries(['install', 'native', 'lint', 'test', 'build'].map(name => [name, process.env[`CHECK_${name.toUpperCase()}`] || 'missing']));
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
  'server/icsFeed.test.ts', 'server/updater.test.ts', 'server/sqlite.test.ts',
  'src/utils/assetValue.test.ts', 'src/utils/bmi.test.ts', 'src/utils/debt.test.ts',
  'src/utils/financePeriod.test.ts', 'src/utils/recurrence.test.ts',
  'src/utils/searchText.test.ts', 'src/utils/vietnamHolidays.test.ts', 'tests/evidence.test.ts',
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
if (process.version !== `v${process.env.EXPECTED_NODE}` || npmVersion !== process.env.EXPECTED_NPM) errors.push('Node/npm differs from pinned toolchain');
if (toolchain?.visualStudioVersion !== process.env.EXPECTED_VS) errors.push('builder differs from validated Visual Studio toolchain');
if (process.platform !== 'win32' || process.arch !== 'x64') errors.push('runner is not Windows x64');
const evidence = {
  commitSha, workflowRunUrl: process.env.WORKFLOW_RUN_URL, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  runnerOS: `${os.type()} ${os.release()}`, runnerImage: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion, nodeVersion: process.version, npmVersion, toolchain,
  checks, suites, native, server2019Acceptance: 'not-run', errors,
};
fs.writeFileSync('reports/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (errors.length) process.exitCode = 1;
