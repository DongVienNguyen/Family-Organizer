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
  'server/productivity/rank.test.ts', 'server/productivity/board.test.ts','server/productivity/grouping.test.ts','src/features/productivity/group-view-format.test.ts','server/productivity/group-view-schema.test.ts','server/productivity/tag-groups.test.ts','server/productivity/tag-group-moves.test.ts','server/productivity/tag-groups.api.test.ts','tests/group-view-native.test.ts','server/productivity/grouped-board.test.ts','server/productivity/grouped-board.api.test.ts','server/productivity/grouped-board-moves.test.ts','server/productivity/grouped-board-moves.api.test.ts',
  'server/productivity/completion-characterization.test.ts','server/productivity/completion-reversal.test.ts','server/productivity/completion-reversal.api.test.ts','server/productivity/completion-claims-snapshot.test.ts','tests/completion-recovery-native.test.ts','tests/completion-import.test.ts','server/productivity/completion-reversal-board.test.ts','server/productivity/completion.test.ts','server/productivity/completion.api.test.ts','server/productivity/clock.test.ts','server/productivity/board-storage.test.ts', 'server/productivity/board-writers.test.ts', 'server/productivity/board-upgrade.test.ts','tests/board-recovery-native.test.ts', 'server/productivity/board-catalog.test.ts','server/productivity/board-catalog.api.test.ts', 'server/productivity/board-reference.test.ts','server/productivity/board-reference.api.test.ts','tests/board-reference-native.test.ts', 'tests/board-package-evidence.test.ts','tests/board-package-fixture.test.ts', 'server/productivity/board-projection.test.ts','server/productivity/board-projection.api.test.ts', 'server/productivity/board-layout.test.ts','server/productivity/board-layout.api.test.ts','server/productivity/board-moves.test.ts','server/productivity/board-moves.api.test.ts','server/productivity/board-wip-override.test.ts', 'server/productivity/adapter.test.ts', 'server/productivity/activation.test.ts', 'server/productivity/bridge-order.test.ts', 'server/productivity/legacy-characterization.test.ts', 'server/productivity/access.test.ts', 'server/productivity/tasks.test.ts', 'server/productivity/access.api.test.ts', 'server/productivity/activation-grants.test.ts', 'server/productivity/structure.test.ts', 'server/productivity/structure-schema.test.ts', 'server/productivity/structure-v1.test.ts', 'server/productivity/structure-upgrade.test.ts', 'server/productivity/structure.api.test.ts', 'server/productivity/tag-ownership.test.ts', 'server/productivity/tag-upgrade.test.ts', 'src/utils/taskTagLabels.test.ts','src/features/productivity/editor.test.ts','src/features/productivity/taskCache.test.ts','src/features/productivity/api.test.ts','server/productivity/pins.test.ts','server/productivity/subtasks.test.ts','server/productivity/pin-upgrade.test.ts','tests/productivity-browser-evidence.test.ts','server/productivity/query.test.ts','server/wallet/store.test.ts','server/wallet/snapshot.test.ts','server/productivity/views.test.ts','server/productivity/search.test.ts','server/productivity/view-upgrade.test.ts','server/wallet/integration.test.ts','server/wallet/coexistence.test.ts','server/productivity/views.api.test.ts','src/features/productivity/query-api.test.ts','src/features/productivity/matrix.test.ts','server/productivity/matrix-upgrade.test.ts','server/productivity/matrix.test.ts','server/productivity/matrix.api.test.ts','src/features/productivity/matrixClient.test.ts','src/features/productivity/matrixState.test.ts','src/features/productivity/drag.test.ts','src/features/productivity/matrixRulePreview.test.ts','src/features/productivity/matrix-ui.test.tsx','src/features/productivity/ruleEditing.test.ts','server/productivity/query-capacity.test.ts','src/features/productivity/queryState.test.ts','src/features/productivity/globalTaskSearch.test.ts','src/features/productivity/savedViewDraft.test.ts','src/features/productivity/openTask.test.ts',];

function runEvidence(change: (reports: Record<string, any>) => void = () => {}) {
  const reports: Record<string, any> = {
    'coverage/coverage-final.json': {synthetic:true},
    'coverage/coverage-summary.json': {synthetic:true},
    'coverage/lcov.info': 'synthetic LCOV',
    'coverage/index.html': 'synthetic HTML',
    'coverage-evidence.json': {commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',providerVersion:'4.1.11',lockSha256:lockHash,baselineSha256:createHash('sha256').update(coveragePolicyText).digest('hex'),sourceInventory:[{path:'server/synthetic.ts',sha256:'c'.repeat(64)}],errors:[],floor:coverageFloor,total:Object.fromEntries(['lines','statements','functions','branches'].map(name=>[name,{total:1,covered:1,skipped:0,pct:100}]))},
    'audit.json':{vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}},
    'audit-context.json':{commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',lockSha256:lockHash},
    'node-sdk.json':{commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',headersSha256:'57c6bee2e30bbbee5bd51d6cc343eb992e174b56a2a1d0eab7a7510771c20ea2',librarySha256:'a0a84aa03917b578d286010b7521837e9ff1136ffb2e4a406c14316c33fd06f7',nativeExitCodes:{policy:0,headers:0,library:0,list:0,listPolicy:0,extract:0},headerVersionVerified:true,localSdkConfigured:true,maxTransferRetries:2,testRetries:0,builderOnly:true,server2019Acceptance:'not-run'},
    'release-report-extraction-native.json':{commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',archiveCount:7,extractedFiles:7,expandedBytes:1470,positiveNativeExit:0,negativeNativeExit:1,negativeBeforeWriteEmpty:true,fixtureCleanup:true,scope:'synthetic-no-github-authentication',publicationAllowed:false,server2019Acceptance:'not-run'},
    'release-inner-extraction-native.json':{commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',archiveCount:2,extractedFiles:1,expandedBytes:20,positiveNativeExit:0,negativeNativeExit:1,negativeBeforeWriteAbsent:true,fixtureCleanup:true,scope:'synthetic-no-github-authentication',publicationAllowed:false,server2019Acceptance:'not-run'},
    'caddy-native.json':{commitSha:sha,nodeVersion:'v24.21.0',platform:'win32',architecture:'x64',caddyVersion:caddyRuntime.version,binarySha256:caddyRuntime.binarySha256,fixtureCleanup:true,systemTrustInstalled:false,backend:'synthetic-loopback-only',server2019Acceptance:'not-run',trustStoreObservation:{fingerprintSha1:'A'.repeat(40),stores:[{location:'CurrentUser',name:'Root',matchingCertificates:0},{location:'LocalMachine',name:'Root',matchingCertificates:0}],exitCode:0},phases:[{name:'version',exitCode:0,signal:null},{name:'validate',exitCode:0,signal:null},{name:'tls-held-backend-status',passed:true},{name:'tls-private-ca-loopback-proxy-header-boundary',passed:true},{name:'untrusted-synthetic-ca-refused',passed:true,errorCode:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'},{name:'owned-admin-stop',exitCode:0,signal:null}]},
    'caddy-exit.json':{commitSha:sha,exitCode:0,nativeExitCodes:{download:0,probe:0},fixtureCleanup:true,server2019Acceptance:'not-run',systemTrustInstalled:false,zipSha256:caddyRuntime.zipSha256,zipSha512:caddyRuntime.zipSha512,licenseSha256:caddyRuntime.licenseSha256},
    'toolchain.json': { npmVersion: '11.19.0', visualStudioVersion: '17.14.37710.0' },
    'native.json': {
      nodeVersion: 'v24.21.0', nodeABI: '137', platform: 'win32', architecture: 'x64',
      addonVersion: '13.0.3', sqliteVersion: '3.49.2', binarySha256: 'a'.repeat(64),
      checks: ['native-load', 'write-read', 'transaction-rollback', 'WAL-backup', 'integrity-check', 'file-cleanup'],
    },
    'production.json': {
      commitSha: sha, nodeVersion: 'v24.21.0', platform: 'win32', architecture: 'x64',
      incompatibleSchemas: ['future','missing-version','foreign','sqliteX','sqliteData','malformed-metadata','malformed-owned-table'].map(name=>({name,exitCode:1,bytesSchemaRowsJournalPreserved:true,databaseSha256:'d'.repeat(64),journal:'delete',nativeHandlesReleased:true,networkAttempts:[]})),
      checks: ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets',
        'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery', 'auth-session-restart', 'auth-session-logout', 'private-response-cache', 'authenticated-realtime', 'object-visibility', 'authenticated-media', 'task-write-authority', 'content-write-authority', 'derived-object-privacy', 'explicit-first-account','provider-digest-privacy','incompatible-schema-preserved'],
    },
    'vitest.json': {
      success: true, numTotalTests: suiteNames.length, numPassedTests: suiteNames.length,
      numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
      testResults: suiteNames.map(name => ({ name: `D:/a/Family-Organizer/${name}`, assertionResults: [{ status: 'passed' }] })),
    },
  };
  for (const check of ['install', 'native', 'lint', 'test', 'build', 'production','audit']) reports[`${check}-exit.json`] = { exitCode: 0 };
  reports['audit-exit.json'].nativeAuditExitCode=0;
  reports['coverage-exit.json']={exitCode:0,nativeCoverageExitCode:0};
  reports['coverage-evidence.json'].sourceInventorySha256=createHash('sha256').update(JSON.stringify(reports['coverage-evidence.json'].sourceInventory)).digest('hex');
  reports['coverage-evidence.json'].reportHashes=Object.fromEntries(['coverage-final.json','coverage-summary.json','lcov.info','index.html'].map(name=>[name,createHash('sha256').update(JSON.stringify(reports['coverage/'+name])).digest('hex')]));
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
      CHECK_PRODUCTION: 'success', CHECK_AUDIT:'success', CHECK_COVERAGE:'success',
    },
  };
  vm.runInNewContext(source, {
    createHash, validateReleaseInnerExtractionNative, validateNodeSdkReceipt, validateCaddyNativeEvidence,validateReleaseReportExtractionNative, process: processFixture, console: { log: () => {} },
    execFileSync: () => sha, os: { type: () => 'Windows_NT', release: () => '10.0.20348' },
    fs: {
      mkdirSync: () => {}, existsSync: (file: string) => file === 'reports/junit.xml' || file.slice(8) in reports,
      readFileSync: (file: string) => file === 'docs/engineering/evidence/windows-coverage-baseline.json'?coveragePolicyText:file === 'package-lock.json'?lockText:file === 'reports/junit.xml' ? '<testcase name="synthetic" />' : JSON.stringify(reports[file.slice(8)]),
      writeFileSync: (file: string, text: string) => { writes[file] = text; },
    },
  });
  return { code: processFixture.exitCode, evidence: JSON.parse(writes['reports/evidence.json']) };
}

describe('Windows CI evidence gate', () => {
  it.each(['commitSha','nodeVersion','platform','architecture','providerVersion','lockSha256','baselineSha256','sourceInventorySha256'])('rejects mismatched coverage %s', name => {
    expect(runEvidence(reports=>{reports['coverage-evidence.json'][name]='invalid';}).code).toBe(1);
  });
  it.each(['coverage-evidence.json','coverage-exit.json','coverage/coverage-final.json','coverage/coverage-summary.json','coverage/lcov.info','coverage/index.html'])('rejects missing coverage %s', name => {
    expect(runEvidence(reports=>{delete reports[name];}).code).toBe(1);
  });
  it.each([-1,1,null])('rejects a nonzero or absent native coverage exit %s', code => {
    expect(runEvidence(reports=>{reports['coverage-exit.json'].nativeCoverageExitCode=code;}).code).toBe(1);
  });
  it('rejects remaining coverage errors',()=>{expect(runEvidence(reports=>{reports['coverage-evidence.json'].errors=['synthetic mismatch'];}).code).toBe(1);});
  it('rejects an empty coverage inventory',()=>{expect(runEvidence(reports=>{reports['coverage-evidence.json'].sourceInventory=[];}).code).toBe(1);});
  it('rejects a lowered unmeasured coverage floor',()=>{expect(runEvidence(reports=>{reports['coverage-evidence.json'].floor={...coverageFloor,branches:0};}).code).toBe(1);});
  it('rejects changed coverage report bytes',()=>{expect(runEvidence(reports=>{reports['coverage/lcov.info']='changed';}).code).toBe(1);});
  it.each(['tests/coverage-evidence.test.ts','tests/coverage-input.test.ts'])('requires coverage regression suite %s', name => {
    expect(runEvidence(reports => { reports['vitest.json'].testResults = reports['vitest.json'].testResults.filter((suite: any) => !suite.name.endsWith(name)); }).evidence.errors).toContain(`required suite missing: ${name}`);
  });
  it.each(['tests/browser-evidence.test.ts', 'tests/browser-providers.test.ts'])('requires the browser harness regression suite %s', name => {
    const result = runEvidence(reports => { reports['vitest.json'].testResults = reports['vitest.json'].testResults.filter((suite: any) => !suite.name.endsWith(name)); });
    expect(result.evidence.errors).toContain(`required suite missing: ${name}`);
  });
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

it('rejects compiled production evidence without authenticated realtime proof',()=>{
  expect(runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((check:string)=>check!=='authenticated-realtime');}).code).toBe(1);
});
it.each(['server/realtimeHttp.test.ts','server/realtime.test.ts','server/legacyVisibility.test.ts','src/utils/realtimeClient.test.ts','tests/ui/realtime-session.test.ts'])('requires realtime suite %s evidence',name=>{
  expect(runEvidence(reports=>{const v=reports['vitest.json'];v.testResults=v.testResults.filter((suite:any)=>!suite.name.endsWith(name));v.numTotalTests=v.numPassedTests=v.testResults.length;}).code).toBe(1);
});

it('requires authoritative object ACL suite evidence',()=>{expect(runEvidence(reports=>{const v=reports['vitest.json'];v.testResults=v.testResults.filter((suite:any)=>!suite.name.endsWith('server/objectAclHttp.test.ts'));v.numTotalTests=v.numPassedTests=v.testResults.length;}).code).toBe(1);});
it('requires compiled object visibility proof',()=>{expect(runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((check:string)=>check!=='object-visibility');}).code).toBe(1);});

it.each(['server/mediaHttp.test.ts','server/mediaMetadata.test.ts','tests/media-cold-restore.test.ts','src/utils/mediaResource.test.ts','tests/ui/authenticated-media.test.ts'])('rejects missing authenticated media suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});
it('rejects missing compiled authenticated media evidence',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!=='authenticated-media');});expect(result.evidence.errors).toContain('production probe check missing: authenticated-media');});

it('rejects missing compiled Markdown media policy suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith('tests/compiled-media-policy.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/compiled-media-policy.test.ts');});

it.each(['server/taskPayload.test.ts','server/taskPayloadHttp.test.ts','tests/ui/task-reward-policy.test.ts'])('rejects missing task write authority suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});
it('rejects missing compiled task write authority proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!=='task-write-authority');});expect(result.evidence.errors).toContain('production probe check missing: task-write-authority');});

it.each(['server/contentPayload.test.ts','server/contentPayloadHttp.test.ts','tests/ui/note-sharing-policy.test.ts'])('rejects missing content write authority suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});
it('rejects missing compiled content write authority proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!=='content-write-authority');});expect(result.evidence.errors).toContain('production probe check missing: content-write-authority');});

it.each(['server/derivedPrivacyHttp.test.ts','server/derivedPrivacyNative.test.ts'])('rejects missing derivative privacy suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});
it('rejects missing compiled derivative privacy proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!=='derived-object-privacy');});expect(result.evidence.errors).toContain('production probe check missing: derived-object-privacy');});

it('rejects missing HTTP dependency security regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/httpDependencySecurity.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/httpDependencySecurity.test.ts');});

it('rejects missing first-account initialization regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/account-initialization.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/account-initialization.test.ts');});
it('rejects missing compiled first-account initialization proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((name:string)=>name!=='explicit-first-account');});expect(result.evidence.errors).toContain('production probe check missing: explicit-first-account');});

it('rejects missing dependency library security regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/librarySecurity.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/librarySecurity.test.ts');});

it.each(['audit.json','audit-context.json','audit-exit.json'])('rejects missing dependency audit evidence %s',name=>{expect(runEvidence(reports=>{delete reports[name];}).code).toBe(1);});
it('rejects nonzero audit wrapper exit even when other checks pass',()=>{expect(runEvidence(reports=>{reports['audit-exit.json'].exitCode=1;}).code).toBe(1);});
it.each(['low','moderate','high','critical'])('rejects dependency audit with remaining %s vulnerabilities',severity=>{expect(runEvidence(reports=>{reports['audit.json'].metadata.vulnerabilities[severity]=1;reports['audit.json'].metadata.vulnerabilities.total=1;reports['audit.json'].vulnerabilities.synthetic={severity};}).code).toBe(1);});
it('rejects audit error JSON despite a zero native exit',()=>{expect(runEvidence(reports=>{reports['audit.json'].error={code:'SYNTHETIC_REGISTRY_ERROR'};}).code).toBe(1);});
it('rejects zero audit totals contradicting nonempty vulnerability records',()=>{expect(runEvidence(reports=>{reports['audit.json'].vulnerabilities.synthetic={severity:'high'};}).code).toBe(1);});
it('rejects an audit of another lockfile',()=>{expect(runEvidence(reports=>{reports['audit-context.json'].lockSha256='b'.repeat(64);}).code).toBe(1);});
it('rejects an audit of another HEAD',()=>{expect(runEvidence(reports=>{reports['audit-context.json'].commitSha='f'.repeat(40);}).code).toBe(1);});
it.each([['nodeVersion','v22.23.3'],['platform','synthetic-other-platform'],['architecture','arm64']])('rejects audit context with mismatched %s',(field,value)=>{expect(runEvidence(reports=>{reports['audit-context.json'][field]=value;}).code).toBe(1);});

it.each([undefined,-1,1,null])('rejects missing or contradictory native audit exit %s despite wrapper exit0',value=>{const result=runEvidence(reports=>{if(value===undefined)delete reports['audit-exit.json'].nativeAuditExitCode;else reports['audit-exit.json'].nativeAuditExitCode=value;});expect(result.code).toBe(1);expect(result.evidence.errors).toContain('audit: missing or nonzero native exit evidence');});

it.each(['server/weeklyDigestPrivacy.test.ts','server/weeklyDigestHttp.test.ts'])('requires the provider privacy suite %s',name=>{const result=runEvidence(reports=>{const tests=reports['vitest.json'];tests.testResults=tests.testResults.filter((suite:any)=>!suite.name.endsWith(name));tests.numTotalTests--;tests.numPassedTests--;});expect(result.code).toBe(1);expect(result.evidence.errors).toContain('required suite missing: '+name);});
it('requires the compiled provider digest privacy proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((check:string)=>check!=='provider-digest-privacy');});expect(result.code).toBe(1);expect(result.evidence.errors).toContain('production probe check missing: provider-digest-privacy');});

it('requires pre-DDL native compatibility regressions',()=>{const result=runEvidence(reports=>{const v=reports['vitest.json'];v.testResults=v.testResults.filter((suite:any)=>!suite.name.endsWith('server/sqliteCompatibility.test.ts'));v.numTotalTests=v.numPassedTests=v.testResults.length;});expect(result.evidence.errors).toContain('required suite missing: server/sqliteCompatibility.test.ts');});
it('requires actual compiled incompatible-schema preservation proof',()=>{const result=runEvidence(reports=>{reports['production.json'].checks=reports['production.json'].checks.filter((check:string)=>check!=='incompatible-schema-preserved');});expect(result.evidence.errors).toContain('production probe check missing: incompatible-schema-preserved');});

it.each(['exitCode','bytesSchemaRowsJournalPreserved','databaseSha256','journal','nativeHandlesReleased','networkAttempts'])('rejects contradictory compiled incompatible-schema %s',field=>{const result=runEvidence(reports=>{const entry=reports['production.json'].incompatibleSchemas[0];entry[field]=field==='networkAttempts'?['synthetic external attempt']:field==='databaseSha256'?'invalid':field==='journal'?'wal':field==='exitCode'?0:false;});expect(result.code).toBe(1);});
it.each(['absent','missing','duplicate'])('rejects %s compiled incompatible-schema cases',kind=>{const result=runEvidence(reports=>{if(kind==='absent')delete reports['production.json'].incompatibleSchemas;else if(kind==='missing')reports['production.json'].incompatibleSchemas.pop();else reports['production.json'].incompatibleSchemas[1]=reports['production.json'].incompatibleSchemas[0];});expect(result.code).toBe(1);});

it('rejects an array-valued compiled database hash instead of coercing it to text',()=>{expect(runEvidence(reports=>{reports['production.json'].incompatibleSchemas[0].databaseSha256=['d'.repeat(64)];}).code).toBe(1);});

it('rejects missing Windows package contract and byte regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/windows-package.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/windows-package.test.ts');});

it('rejects missing package license and source-retention regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/package-licenses.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/package-licenses.test.ts');});

it('rejects missing Windows service regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/windows-service.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/windows-service.test.ts');});

it('rejects missing ordinary-backup credential privacy regressions',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/backupCredentials.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/backupCredentials.test.ts');});

it.each(['server/recoveryEnvelope.test.ts', 'server/recoverySettings.test.ts', 'server/recoveryFiles.test.ts', 'server/recoveryEnv.test.ts','tests/recovery-operator.test.ts'])('rejects missing mandatory recovery suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});

it('rejects a missing required private-settings recovery suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/recoverySettings.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/recoverySettings.test.ts');});

it('rejects a missing required signing-key recovery suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/recoveryFiles.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/recoveryFiles.test.ts');});

it('rejects a missing required provider-env recovery suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/recoveryEnv.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/recoveryEnv.test.ts');});

it('rejects missing required online recovery suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/online-recovery.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/online-recovery.test.ts');});

it.each(['server/recoverySchedule.test.ts','server/recoverySchedule.jobs.test.ts','tests/scheduled-recovery.test.ts'])('rejects missing scheduled recovery suite %s',name=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(name));});expect(result.evidence.errors).toContain('required suite missing: '+name);});

it.each(['server/recoveryRetention.test.ts','tests/recovery-maintenance-operator.test.ts'])('rejects missing required encrypted maintenance suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
it.each(['server/updateFence.test.ts','tests/update-startup.test.ts'])('rejects missing mandatory update-fence suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/updateInspection.test.ts','tests/update-journal.test.ts'])('rejects missing mandatory owned update suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing mandatory release evidence policy suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/release-evidence.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/release-evidence.test.ts');});

it.each(['server/shoppingPersistence.test.ts','server/shoppingHttp.test.ts'])('rejects missing required legacy shopping suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing mandatory release metadata suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/release-metadata.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/release-metadata.test.ts');});

it('rejects missing required legacy finance regression suite',()=>{const suite='server/legacyFinanceHttp.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing mandatory authenticated archive suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/release-archives.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/release-archives.test.ts');});
it.each(['tests/release-quality-reports.test.ts','tests/release-source-policy.test.ts'])('rejects missing required raw report policy suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['caddy-native.json','caddy-exit.json'])('rejects missing actual pinned Caddy native evidence %s',name=>expect(runEvidence(reports=>{delete reports[name];}).code).toBe(1));
it.each(['tests/caddy-native-policy.test.ts','tests/caddy-native-evidence.test.ts'])('rejects missing required Caddy suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['tests/release-report-files.test.ts','tests/release-quality-files.test.ts','tests/release-report-extraction.test.ts'])('rejects missing required archive/report filesystem suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing actual native report extraction proof',()=>expect(runEvidence(reports=>{delete reports['release-report-extraction-native.json'];}).code).toBe(1));

it('rejects missing actual pinned SDK builder evidence',()=>expect(runEvidence(reports=>{delete reports['node-sdk.json'];}).code).toBe(1));
it('rejects missing mandatory SDK policy suite',()=>{const suite='tests/node-sdk-policy.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['tests/release-runtime-reports.test.ts','tests/release-runtime-files.test.ts','tests/release-coverage-files.test.ts'])('rejects missing required runtime/rawcoverage collector suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing native SDK transfer retry regression suite',()=>{const suite='tests/sdk-transfer-retry.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing required raw browser reader suite',()=>{const suite='tests/release-browser-files.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing required package report reader suite',()=>{const suite='tests/release-package-reports.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing required compiled consumer report suite',()=>{const suite='tests/release-consumer-reports.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing required service report reader suite',()=>{const suite='tests/release-service-reports.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing real legacy health HTTP regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/legacyHealthHttp.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/legacyHealthHttp.test.ts');});

it.each(['tests/release-auxiliary-reports.test.ts','tests/release-harness-build.test.ts'])('rejects missing required auxiliary/harness agreement suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['tests/release-inner-package.test.ts','tests/release-inner-extraction.test.ts','tests/release-inner-native.test.ts'])('requires inner package/native validation suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires actual native inner extraction receipt',()=>expect(runEvidence(reports=>{delete reports['release-inner-extraction-native.json'];}).code).toBe(1));

it('rejects missing push permission startup regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('src/utils/pushSubscription.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: src/utils/pushSubscription.test.ts');});

it('rejects missing browser protocol redaction regression suite',()=>{const suite='tests/browser-protocol.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing real legacy calendar HTTP regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/legacyCalendarHttp.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/legacyCalendarHttp.test.ts');});

it('rejects missing real offline AI HTTP regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/legacyAiHttp.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/legacyAiHttp.test.ts');});

it('rejects missing normalized release collector regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/release-collector-evidence.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/release-collector-evidence.test.ts');});

it('rejects missing actual assistant launcher focus regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('src/utils/assistantFocus.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: src/utils/assistantFocus.test.ts');});

it('rejects missing publication-disabled candidate handoff regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('tests/release-candidate-handoff.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: tests/release-candidate-handoff.test.ts');});

it('rejects missing notification acknowledgement ownership regression suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('src/utils/notificationRead.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: src/utils/notificationRead.test.ts');});

it('rejects missing legacy feature flag HTTP regression suite',()=>{const suite='server/legacyFlagsHttp.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
it('requires Caddy failure diagnostic regression suite',()=>{const suite='tests/caddy-failure-diagnostics.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['dates','filters','contracts'])('rejects missing P01 %s mandatory suite',name=>{const suite='src/features/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['migration','store'])('rejects missing P02-a %s mandatory suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['adapter','activation','bridge-order'])('rejects missing P02-b1 %s mandatory suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects a Windows report that omitted active legacy approval/recurrence characterization',()=>{const suite='server/productivity/legacy-characterization.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['access','tasks'])('rejects missing P03-a %s mandatory suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['access.api','activation-grants'])('rejects missing P03-b %s mandatory suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['structure','structure-schema','structure-v1','structure-upgrade'])('rejects missing P04-a %s mandatory suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('rejects missing P04-b1 structure HTTP mandatory suite',()=>{const suite='server/productivity/structure.api.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/tag-ownership.test.ts','server/productivity/tag-upgrade.test.ts','src/utils/taskTagLabels.test.ts'])('rejects missing P04-b2 tag compatibility suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
it.each(['money','dates','filter'])('rejects missing W01 %s mandatory suite',name=>{const suite='src/features/wallet/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['src/features/productivity/editor.test.ts', 'src/features/productivity/taskCache.test.ts', 'src/features/productivity/api.test.ts', 'server/productivity/pins.test.ts', 'server/productivity/subtasks.test.ts', 'server/productivity/pin-upgrade.test.ts', 'tests/productivity-browser-evidence.test.ts'])('requires P04 shared drawer and personal pin suite %s',name=>{const result=runEvidence(reports=>{const v=reports['vitest.json'];v.testResults=v.testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith(name));v.numTotalTests=v.numPassedTests=v.testResults.length;});expect(result.evidence.errors).toContain('required suite missing: '+name);});

it('requires the P05 authorized query and selection regression suite',()=>{const name='server/productivity/query.test.ts',result=runEvidence(reports=>{const v=reports['vitest.json'];v.testResults=v.testResults.filter((suite:any)=>!suite.name.replaceAll('\\','/').endsWith(name));v.numTotalTests=v.numPassedTests=v.testResults.length;});expect(result.evidence.errors).toContain('required suite missing: '+name);});


it.each(['server/wallet/store.test.ts','server/wallet/snapshot.test.ts'])('requires Wallet core regression suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
it.each(['views','search','view-upgrade'])('requires persisted P05 %s regression suite',name=>{const suite='server/productivity/'+name+'.test.ts';const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires shared Wallet snapshot and bootstrap regressions',()=>{const suite='server/wallet/integration.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires combined Wallet/productivity restore regression',()=>{const suite='server/wallet/coexistence.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/views.api.test.ts','src/features/productivity/query-api.test.ts','server/productivity/query-capacity.test.ts'])('requires internal query/saved-view consumer suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['src/features/productivity/queryState.test.ts','src/features/productivity/globalTaskSearch.test.ts','src/features/productivity/savedViewDraft.test.ts','src/features/productivity/openTask.test.ts'])('requires the session-scoped query/search consumer suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires the pure Matrix classifier and inverse proposal suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('src/features/productivity/matrix.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: src/features/productivity/matrix.test.ts');});

it.each(['server/productivity/matrix-upgrade.test.ts','server/productivity/matrix.test.ts','server/productivity/matrix.api.test.ts'])('requires authoritative Matrix migration/commands/HTTP suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['src/features/productivity/matrixClient.test.ts','src/features/productivity/matrixState.test.ts'])('requires Matrix preview client/state consumer suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['src/features/productivity/drag.test.ts','src/features/productivity/matrixRulePreview.test.ts','src/features/productivity/matrix-ui.test.tsx','src/features/productivity/ruleEditing.test.ts'])('requires Matrix UI/rule/drag consumer suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/rank.test.ts','server/productivity/board.test.ts'])('requires the Kanban pure policy suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires the shared board storage contract suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/productivity/board-storage.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/productivity/board-storage.test.ts');});

it('requires the canonical board writer invariant suite',()=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith('server/productivity/board-writers.test.ts'));});expect(result.evidence.errors).toContain('required suite missing: server/productivity/board-writers.test.ts');});

it.each(['server/productivity/board-upgrade.test.ts','tests/board-recovery-native.test.ts'])('requires current board migration/recovery suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/board-catalog.test.ts','server/productivity/board-catalog.api.test.ts'])('requires shared board config/internalHTTP suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/board-reference.test.ts','server/productivity/board-reference.api.test.ts','tests/board-reference-native.test.ts'])('requires versioned shared board reference suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['tests/board-package-evidence.test.ts','tests/board-package-fixture.test.ts'])('requires actual board ZIP evidence suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
it.each(['server/productivity/board-projection.test.ts','server/productivity/board-projection.api.test.ts'])('requires private-safe board projection suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/board-moves.test.ts','server/productivity/board-moves.api.test.ts','server/productivity/board-wip-override.test.ts'])('requires transactional board move suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/completion-characterization.test.ts','server/productivity/completion.test.ts','server/productivity/completion.api.test.ts'])('requires semantic completion policy/command/HTTP suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/board-layout.test.ts','server/productivity/board-layout.api.test.ts'])('requires canonical board layout suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires the native Productivity wall clock regression suite',()=>{const suite='server/productivity/clock.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires the pure Kanban grouping regression suite',()=>{const suite='server/productivity/grouping.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/grouped-board.test.ts','server/productivity/grouped-board.api.test.ts'])('requires authorized grouped-board suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/grouped-board-moves.test.ts','server/productivity/grouped-board-moves.api.test.ts'])('requires selected-dimension grouped-board move suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['server/productivity/completion-reversal.test.ts','server/productivity/completion-reversal.api.test.ts','server/productivity/completion-claims-snapshot.test.ts'])('requires linked completion reversal/domain/HTTP/restore suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires compiled completion linked-reversal recovery',()=>{const suite='tests/completion-recovery-native.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires side-effect-free completion imports',()=>{const suite='tests/completion-import.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it('requires linked completion and shared WIP integration',()=>{const suite='server/productivity/completion-reversal-board.test.ts',result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});

it.each(['src/features/productivity/group-view-format.test.ts', 'server/productivity/group-view-schema.test.ts', 'server/productivity/tag-groups.test.ts', 'server/productivity/tag-group-moves.test.ts', 'server/productivity/tag-groups.api.test.ts', 'tests/group-view-native.test.ts'])('requires persisted tag format/read/move/native suite %s',suite=>{const result=runEvidence(reports=>{reports['vitest.json'].testResults=reports['vitest.json'].testResults.filter((row:any)=>!row.name.endsWith(suite));});expect(result.evidence.errors).toContain('required suite missing: '+suite);});
