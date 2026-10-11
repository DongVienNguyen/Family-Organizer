import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../scripts/ci/write-evidence.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const sha = '1234567890123456789012345678901234567890';
const suiteNames = [
  'server/icsFeed.test.ts', 'server/updater.test.ts', 'server/sqlite.test.ts',
  'server/appStore.test.ts', 'server/appMigrations.test.ts', 'server/rewardStore.test.ts', 'server/commandHttp.test.ts',
  'server/jobStore.test.ts', 'server/appJobs.durable.test.ts', 'server/pushOutbox.test.ts', 'server/pushDelivery.test.ts', 'server/providerJobs.test.ts', 'server/pushTransport.test.ts', 'server/auth.test.ts', 'server/authStore.test.ts', 'server/authHttp.test.ts', 'src/utils/clientSession.test.ts', 'src/utils/sessionBoundary.test.ts', 'src/utils/privateStorage.test.ts', 'src/utils/privacyWorker.test.ts', 'src/utils/serviceWorkerWatch.test.ts', 'tests/sw-cache.test.ts', 'tests/ui/session-bootstrap.test.ts', 'src/utils/pdfExport.test.ts', 'server/appSnapshot.test.ts', 'server/fullBackup.test.ts', 'tests/snapshot-recovery.test.ts', 'tests/snapshot-http.test.ts',
  'src/utils/assetValue.test.ts', 'src/utils/bmi.test.ts', 'src/utils/debt.test.ts',
  'src/utils/financePeriod.test.ts', 'src/utils/recurrence.test.ts',
  'src/utils/searchText.test.ts', 'src/utils/vietnamHolidays.test.ts', 'tests/evidence.test.ts',
  'server/config.test.ts', 'tests/data-migration.test.ts', 'tests/native-scripts.test.ts',
  'tests/native-paths.test.ts', 'tests/native-gc.test.ts',
  'server/app.test.ts', 'server/lifecycle.test.ts', 'server/appJobs.test.ts',
  'server/appEffects.test.ts', 'server/systemMetrics.test.ts', 'tests/runtime-process.test.ts', 'tests/ui/windows-version.test.tsx', 'tests/runtime-ownership.test.ts',
];

function runEvidence(change: (reports: Record<string, any>) => void = () => {}) {
  const reports: Record<string, any> = {
    'toolchain.json': { npmVersion: '11.19.0', visualStudioVersion: '17.14.37710.0' },
    'native.json': {
      nodeVersion: 'v24.21.0', nodeABI: '137', platform: 'win32', architecture: 'x64',
      addonVersion: '13.0.3', sqliteVersion: '3.49.2', binarySha256: 'a'.repeat(64),
      checks: ['native-load', 'write-read', 'transaction-rollback', 'WAL-backup', 'integrity-check', 'file-cleanup'],
    },
    'production.json': {
      commitSha: sha, nodeVersion: 'v24.21.0', platform: 'win32', architecture: 'x64',
      checks: ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets',
        'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery', 'auth-session-restart', 'auth-session-logout', 'private-response-cache'],
    },
    'vitest.json': {
      success: true, numTotalTests: suiteNames.length, numPassedTests: suiteNames.length,
      numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
      testResults: suiteNames.map(name => ({ name: `D:/a/Family-Organizer/${name}`, assertionResults: [{ status: 'passed' }] })),
    },
  };
  for (const check of ['install', 'native', 'lint', 'test', 'build', 'production']) reports[`${check}-exit.json`] = { exitCode: 0 };
  change(reports);
  const writes: Record<string, string> = {};
  const processFixture = {
    cwd: () => 'D:\\a\\Family-Organizer', platform: 'win32', arch: 'x64', version: 'v24.21.0',
    versions: { modules: '137' }, exitCode: 0,
    env: {
      EXPECTED_NODE: '24.21.0', EXPECTED_NPM: '11.19.0', EXPECTED_VS: '17.14.37710.0',
      EXPECTED_SQLITE_ADDON: '13.0.3',
      TEST_COMMIT_SHA: sha, GITHUB_RUN_ATTEMPT: '1',
      CHECK_INSTALL: 'success', CHECK_NATIVE: 'success', CHECK_LINT: 'success', CHECK_TEST: 'success', CHECK_BUILD: 'success',
      CHECK_PRODUCTION: 'success',
    },
  };
  vm.runInNewContext(source, {
    process: processFixture, console: { log: () => {} },
    execFileSync: () => sha, os: { type: () => 'Windows_NT', release: () => '10.0.20348' },
    fs: {
      mkdirSync: () => {}, existsSync: (file: string) => file === 'reports/junit.xml' || file.slice(8) in reports,
      readFileSync: (file: string) => file === 'reports/junit.xml' ? '<testcase name="synthetic" />' : JSON.stringify(reports[file.slice(8)]),
      writeFileSync: (file: string, text: string) => { writes[file] = text; },
    },
  });
  return { code: processFixture.exitCode, evidence: JSON.parse(writes['reports/evidence.json']) };
}

describe('Windows CI evidence gate', () => {
  it('accepts consistent synthetic reports and normalizes Windows suite paths', () => {
    const result = runEvidence();
    expect(result.code).toBe(0);
    expect(result.evidence.suites[0].name).toBe('server/icsFeed.test.ts');
  });

  it.each([
    ['platform', 'linux'], ['architecture', 'arm64'], ['nodeVersion', 'v22.0.0'],
    ['nodeABI', '127'], ['addonVersion', '0.0.0'], ['binarySha256', 'invalid'], ['checks', []],
  ])('rejects contradictory native %s', (field, value) => {
    expect(runEvidence(reports => { reports['native.json'][field] = value; }).code).toBe(1);
  });

  it('rejects an empty suite even when global test totals claim success', () => {
    expect(runEvidence(reports => {
      reports['vitest.json'].testResults.push({ name: 'D:/a/Family-Organizer/empty.test.ts', assertionResults: [] });
    }).code).toBe(1);
  });

  it('rejects a missing expected suite', () => {
    expect(runEvidence(reports => { reports['vitest.json'].testResults.pop(); }).code).toBe(1);
  });

  it('rejects skipped assertions hidden by successful aggregate totals', () => {
    expect(runEvidence(reports => { reports['vitest.json'].testResults[0].assertionResults[0].status = 'skipped'; }).code).toBe(1);
  });

  it('rejects missing production startup evidence', () => {
    expect(runEvidence(reports => { delete reports['production.json']; }).code).toBe(1);
  });

  it('rejects production startup evidence from another SHA', () => {
    expect(runEvidence(reports => { reports['production.json'].commitSha = 'f'.repeat(40); }).code).toBe(1);
  });
  it.each(['auth-session-restart','auth-session-logout'])('rejects missing compiled production %s evidence',check=>{
    expect(runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!==check);}).code).toBe(1);
  });

  it('rejects production reports that omit the permission or offline checks', () => {
    expect(runEvidence(reports => { reports['production.json'].checks = []; }).code).toBe(1);
  });
  it.each(['server/app.test.ts','server/lifecycle.test.ts','server/appJobs.test.ts','server/appEffects.test.ts','server/systemMetrics.test.ts','tests/runtime-process.test.ts','tests/ui/windows-version.test.tsx','tests/runtime-ownership.test.ts'])('rejects missing F03 suite %s', name => {
    expect(runEvidence(reports => { const v=reports['vitest.json']; v.testResults=v.testResults.filter((s:any)=>!s.name.endsWith(name)); v.numTotalTests=v.numPassedTests=v.testResults.length; }).code).toBe(1);
  });
  it.each(['graceful-shutdown','readiness','crash-recovery'])('rejects missing compiled-production lifecycle evidence %s', check => {
    expect(runEvidence(reports=>{ reports['production.json'].checks=reports['production.json'].checks.filter((c:string)=>c!==check); }).code).toBe(1);
  });

});

it('rejects compiled production evidence without private response cache proof',()=>{
  expect(runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((check:string)=>check!=='private-response-cache');}).code).toBe(1);
});
