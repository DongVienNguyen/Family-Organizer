import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {safeArchivePath} from './package-contract.mjs';
import {assertNoLinkedAncestors} from '../lib/native-paths.mjs';
// Exact existing writer contracts; expected nonzero refusals are deliberate.
const contracts={
 "service-exit.json": {
  "checks": [
   "synthetic-service-security-refusals",
   "validate-only-whatif-no-mutation",
   "owned-idempotent-install-data-preserved",
   "localservice-per-service-sid-acl",
   "automatic-delayed-start-bounded-logs",
   "start-stop-graceful-closed-handles",
   "owned-offline-credential-reentry",
   "owned-encrypted-recovery",
   "restart-graceful-worker-replacement-persistence",
   "restart-crash-recovery-persistence",
   "owned-localservice-scheduled-encrypted-backup",
   "owned-update-startup-fence-durable-rollback-boundary",
   "owned-native-update-pre-post-write-compatible-rollback",
   "owned-uninstall-idempotent-data-retained"
  ],
  "phases": [
   {
    "phase": "validate-only",
    "exitCode": 0
   },
   {
    "phase": "what-if",
    "exitCode": 0
   },
   {
    "phase": "install",
    "exitCode": 0
   },
   {
    "phase": "version",
    "exitCode": 0
   },
   {
    "phase": "seed",
    "exitCode": 0
   },
   {
    "phase": "install-again",
    "exitCode": 0
   },
   {
    "phase": "start",
    "exitCode": 0
   },
   {
    "phase": "first-functional",
    "exitCode": 0
   },
   {
    "phase": "credential-active",
    "exitCode": 0
   },
   {
    "phase": "recovery-active",
    "exitCode": 0
   },
   {
    "phase": "stop",
    "exitCode": 0
   },
   {
    "phase": "database-closed",
    "exitCode": 0
   },
   {
    "phase": "credential-stopped",
    "exitCode": 0
   },
   {
    "phase": "recovery-stopped",
    "exitCode": 0
   },
   {
    "phase": "restart-start",
    "exitCode": 0
   },
   {
    "phase": "restarted-functional",
    "exitCode": 0
   },
   {
    "phase": "restart",
    "exitCode": 0
   },
   {
    "phase": "restart-graceful-functional",
    "exitCode": 0
   },
   {
    "phase": "recovered-functional",
    "exitCode": 0
   },
   {
    "phase": "final-stop",
    "exitCode": 0
   },
   {
    "phase": "database-closed",
    "exitCode": 0
   },
   {
    "phase": "scheduled-configure",
    "exitCode": 0
   },
   {
    "phase": "scheduled-start",
    "exitCode": 0
   },
   {
    "phase": "scheduled-active",
    "exitCode": 0
   },
   {
    "phase": "scheduled-stop",
    "exitCode": 0
   },
   {
    "phase": "database-closed",
    "exitCode": 0
   },
   {
    "phase": "scheduled-finalize",
    "exitCode": 0
   },
   {
    "phase": "update-configure-held",
    "exitCode": 0
   },
   {
    "phase": "update-start-held",
    "exitCode": 0
   },
   {
    "phase": "update-held",
    "exitCode": 0
   },
   {
    "phase": "update-stop-held",
    "exitCode": 0
   },
   {
    "phase": "database-closed",
    "exitCode": 0
   },
   {
    "phase": "update-stopped-held",
    "exitCode": 0
   },
   {
    "phase": "update-configure-approve",
    "exitCode": 0
   },
   {
    "phase": "update-start-candidate",
    "exitCode": 0
   },
   {
    "phase": "update-approve",
    "exitCode": 0
   },
   {
    "phase": "update-ready",
    "exitCode": 0
   },
   {
    "phase": "update-stop-approved",
    "exitCode": 0
   },
   {
    "phase": "database-closed",
    "exitCode": 0
   },
   {
    "phase": "owned-update-coordinator",
    "exitCode": 0
   },
   {
    "phase": "uninstall",
    "exitCode": 0
   },
   {
    "phase": "uninstall-again",
    "exitCode": 0
   }
  ],
  "preflight": [
   {
    "exitCode": 0,
    "phase": "package-validation"
   },
   {
    "exitCode": 0,
    "phase": "security-render"
   },
   {
    "exitCode": 1,
    "phase": "owned-configuration"
   },
   {
    "exitCode": 1,
    "phase": "owned-configuration"
   },
   {
    "exitCode": 0,
    "phase": "package-validation"
   }
  ]
 },
 "service-functional.json": {
  "checks": [
   "synthetic-offline-fixture",
   "service-finance-write",
   "closed-database-integrity",
   "service-restart-persistence",
   "service-restart-persistence",
   "service-crash-recovery-persistence",
   "closed-database-integrity",
   "closed-database-integrity",
   "closed-database-integrity",
   "closed-database-integrity"
  ]
 },
 "service-credentials.json": {
  "checks": [
   "windows-desktop-host-security-module-validated",
   "running-service-refused-before-input",
   "validation-whatif-no-input-no-mutation",
   "invalid-batch-atomic-no-secret-output",
   "owned-compiled-operator-reentry-preserves-ids-roles-business"
  ],
  "phases": [
   {
    "phase": "desktop-host-validation",
    "exitCode": 0
   },
   {
    "phase": "active-refusal",
    "exitCode": 1
   },
   {
    "phase": "-ValidateOnly",
    "exitCode": 0
   },
   {
    "phase": "-WhatIf",
    "exitCode": 0
   },
   {
    "phase": "invalid-batch",
    "exitCode": 1
   },
   {
    "phase": "credential-reentry",
    "exitCode": 0
   }
  ]
 },
 "service-recovery.json": {
  "checks": [
   "owned-recovery-running-service-refused-before-input",
   "owned-recovery-validation-whatif-no-input-mutation",
   "owned-recovery-operation-lock-overlap-no-journal-mutation",
   "owned-recovery-encrypted-backup-external-key",
   "owned-recovery-wrong-key-no-mutation",
   "owned-recovery-restore-business-ids-session-revocation",
   "owned-private-settings-missing-group-no-mutation",
   "owned-private-settings-selected-restore-business-preserved",
   "owned-unselected-signing-key-retained",
   "owned-selected-signing-key-business-session-policy-preserved",
   "owned-unselected-provider-env-bytes-retained",
   "owned-selected-provider-env-host-business-session-policy-preserved"
  ],
  "phases": [
   {
    "phase": "active-Backup",
    "exitCode": 1
   },
   {
    "phase": "active-Restore",
    "exitCode": 1
   },
   {
    "phase": "Backup-ValidateOnly",
    "exitCode": 0
   },
   {
    "phase": "Backup-WhatIf",
    "exitCode": 0
   },
   {
    "phase": "Restore-ValidateOnly",
    "exitCode": 0
   },
   {
    "phase": "Restore-WhatIf",
    "exitCode": 0
   },
   {
    "phase": "overlap-Backup",
    "exitCode": 1
   },
   {
    "phase": "overlap-Restore",
    "exitCode": 1
   },
   {
    "phase": "overlap-Reset",
    "exitCode": 1
   },
   {
    "phase": "encrypted-backup",
    "exitCode": 0
   },
   {
    "phase": "wrong-key",
    "exitCode": 1
   },
   {
    "phase": "encrypted-restore",
    "exitCode": 0
   },
   {
    "phase": "private-settings-backup",
    "exitCode": 0
   },
   {
    "phase": "private-settings-missing-group",
    "exitCode": 1
   },
   {
    "phase": "private-settings-restore",
    "exitCode": 0
   },
   {
    "phase": "signing-key-backup",
    "exitCode": 0
   },
   {
    "phase": "signing-key-omitted",
    "exitCode": 0
   },
   {
    "phase": "signing-key-selected",
    "exitCode": 0
   },
   {
    "phase": "provider-env-backup",
    "exitCode": 0
   },
   {
    "phase": "provider-env-omitted",
    "exitCode": 0
   },
   {
    "phase": "provider-env-selected",
    "exitCode": 0
   }
  ]
 },
 "service-scheduled-backup.json": {
  "checks": [
   "owned-schedule-validation-whatif-no-input-no-mutation",
   "owned-schedule-explicit-portable-key-idempotent-no-rotation",
   "owned-schedule-existing-key-readers-resealed-bytes-retained",
   "owned-schedule-reinstall-private-key-config-acls-preserved",
   "owned-localservice-scheduled-capture-ready-private-health-key-excluded",
   "owned-maintenance-validation-whatif-no-input-no-mutation",
   "owned-maintenance-copy-root-untrusted-writer-refused",
   "owned-maintenance-file-owner-writer-delete-child-short-alias-hostile-parent-refused",
   "owned-encrypted-copy-retention-shared-restore-key-source-preserved",
   "owned-scheduled-offline-restore-claims-sessions-source-key-retained"
  ],
  "phases": [
   {
    "phase": "schedule--ValidateOnly",
    "exitCode": 0
   },
   {
    "phase": "schedule--WhatIf",
    "exitCode": 0
   },
   {
    "phase": "schedule-invalid-selection",
    "exitCode": 1
   },
   {
    "phase": "schedule-enable",
    "exitCode": 0
   },
   {
    "phase": "schedule-enable-again",
    "exitCode": 0
   },
   {
    "phase": "schedule-key-change-refusal",
    "exitCode": 1
   },
   {
    "phase": "schedule-extra-reader-fixture",
    "exitCode": 0
   },
   {
    "phase": "schedule-extra-reader-reseal",
    "exitCode": 0
   },
   {
    "phase": "schedule-extra-reader-acl",
    "exitCode": 0
   },
   {
    "phase": "schedule-missing-service-read-fixture",
    "exitCode": 0
   },
   {
    "phase": "schedule-missing-service-read-reseal",
    "exitCode": 0
   },
   {
    "phase": "schedule-missing-service-read-acl",
    "exitCode": 0
   },
   {
    "phase": "schedule-reinstall",
    "exitCode": 0
   },
   {
    "phase": "schedule-reinstall-acl",
    "exitCode": 0
   },
   {
    "phase": "schedule-running-refusal",
    "exitCode": 1
   },
   {
    "phase": "schedule-shared-offline-restore",
    "exitCode": 0
   },
   {
    "phase": "maintenance--ValidateOnly",
    "exitCode": 0
   },
   {
    "phase": "maintenance--WhatIf",
    "exitCode": 0
   },
   {
    "phase": "maintenance-seal-copy-root",
    "exitCode": 0
   },
   {
    "phase": "maintenance-untrusted-writer-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-untrusted-writer-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-reseal-copy-root",
    "exitCode": 0
   },
   {
    "phase": "maintenance-ancestor-inventory",
    "exitCode": 0
   },
   {
    "phase": "maintenance-copy",
    "exitCode": 0
   },
   {
    "phase": "maintenance-copy-again",
    "exitCode": 0
   },
   {
    "phase": "maintenance-review-anchor-seal",
    "exitCode": 0
   },
   {
    "phase": "maintenance-file-writer-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-file-writer-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-file-writer-reseal",
    "exitCode": 0
   },
   {
    "phase": "maintenance-file-owner-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-file-owner-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-file-owner-reseal",
    "exitCode": 0
   },
   {
    "phase": "maintenance-delete-child-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-delete-child-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-delete-child-reseal",
    "exitCode": 0
   },
   {
    "phase": "maintenance-short-name-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-alias-files-seal",
    "exitCode": 0
   },
   {
    "phase": "maintenance-source-short-alias-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-protected-short-alias-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-hostile-parent-fixture",
    "exitCode": 0
   },
   {
    "phase": "maintenance-hostile-parent-refusal",
    "exitCode": 1
   },
   {
    "phase": "maintenance-prune",
    "exitCode": 0
   },
   {
    "phase": "maintenance-copy-shared-restore",
    "exitCode": 0
   },
   {
    "phase": "schedule-disable",
    "exitCode": 0
   }
  ],
  "reviewRegressions": [
   {
    "phase": "maintenance-file-writer-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   },
   {
    "phase": "maintenance-file-owner-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   },
   {
    "phase": "maintenance-delete-child-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   },
   {
    "phase": "maintenance-source-short-alias-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   },
   {
    "phase": "maintenance-protected-short-alias-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   },
   {
    "phase": "maintenance-hostile-parent-refusal",
    "exitCode": 1,
    "expectedExitCode": 1
   }
  ]
 },
 "service-update-fence.json": {
  "checks": [
   "owned-update-fixed-control-private-reader-reinstall-preserved",
   "owned-update-held-http-jobs-no-writes-open",
   "owned-update-held-stop-graceful-closed-storage",
   "owned-update-new-attempt-held-before-approval",
   "owned-update-approved-health-smoke-durable-boundary-before-ready"
  ],
  "phases": [
   {
    "phase": "update-configure-held-seal",
    "exitCode": 0
   },
   {
    "phase": "update-configure-held-reinstall",
    "exitCode": 0
   },
   {
    "phase": "update-configure-held-reinstall-acl",
    "exitCode": 0
   },
   {
    "phase": "update-configure-approve-seal",
    "exitCode": 0
   },
   {
    "phase": "update-configure-approve-reinstall",
    "exitCode": 0
   },
   {
    "phase": "update-configure-approve-reinstall-acl",
    "exitCode": 0
   },
   {
    "phase": "update-approve-publish",
    "exitCode": 0
   }
  ]
 },
 "service-update-coordinator.json": {
  "checks": [
   "owned-update-validation-whatif-no-input-no-stop-no-mutation",
   "owned-update-install-uninstall-share-existing-operation-guard",
   "owned-update-candidate-failure-preapproval-shared-restore-fresh-writes-retained",
   "owned-update-stopped-fresh-encrypted-snapshot-held-approve-ready-latch-history",
   "owned-update-source-operator-capture-before-candidate-bootstrap",
   "owned-update-postapproval-snapshot-refused-no-data-journal-control-mutation",
   "owned-update-incompatible-binary-refused-without-reset-or-snapshot-loss",
   "owned-update-compatible-binary-rollback-postapproval-business-retained",
   "owned-update-ordinary-explicit-rollback-failure-stopped-data-latch-retained",
   "owned-update-closed-handles-claim-no-replay-source-key-snapshot-retained"
  ],
  "phases": [
   {
    "phase": "coordinator-seal-candidate",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-writable-fixture",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-writable-refusal",
    "exitCode": 1
   },
   {
    "phase": "coordinator-review-writable-reseal",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-stale-owner-refusal",
    "exitCode": 1
   },
   {
    "phase": "coordinator-review-stale-owner-repair",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-snapshot-seal",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-snapshot-reinstall",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-snapshot-acl",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-snapshot-reseal",
    "exitCode": 0
   },
   {
    "phase": "coordinator-validateonly",
    "exitCode": 0
   },
   {
    "phase": "coordinator-whatif",
    "exitCode": 0
   },
   {
    "phase": "coordinator-overlap-apply",
    "exitCode": 1
   },
   {
    "phase": "coordinator-overlap-install",
    "exitCode": 1
   },
   {
    "phase": "coordinator-overlap-uninstall",
    "exitCode": 1
   },
   {
    "phase": "coordinator-start-source",
    "exitCode": 0
   },
   {
    "phase": "coordinator-stop-source-for-fault",
    "exitCode": 0
   },
   {
    "phase": "coordinator-candidate-failure",
    "exitCode": 1
   },
   {
    "phase": "coordinator-snapshot-rollback-idempotent",
    "exitCode": 0
   },
   {
    "phase": "coordinator-healthy-apply",
    "exitCode": 0
   },
   {
    "phase": "coordinator-apply-idempotent",
    "exitCode": 0
   },
   {
    "phase": "coordinator-postopen-snapshot-refusal",
    "exitCode": 1
   },
   {
    "phase": "coordinator-stop-for-schema-refusal",
    "exitCode": 0
   },
   {
    "phase": "coordinator-incompatible-binary-refusal",
    "exitCode": 1
   },
   {
    "phase": "coordinator-review-explicit-rollback-failure",
    "exitCode": 1
   },
   {
    "phase": "coordinator-review-explicit-rollback-stopped",
    "exitCode": 0
   },
   {
    "phase": "coordinator-review-explicit-rollback-repair",
    "exitCode": 0
   },
   {
    "phase": "coordinator-compatible-binary-rollback",
    "exitCode": 0
   },
   {
    "phase": "coordinator-binary-rollback-idempotent",
    "exitCode": 0
   },
   {
    "phase": "coordinator-final-stop",
    "exitCode": 0
   },
   {
    "phase": "coordinator-closed-storage",
    "exitCode": 0
   }
  ],
  "reviewRefusals": [
   {
    "name": "mutable-candidate-executable-refused-before-elevated-execution",
    "actualExitCode": 1,
    "expectedExitCode": 1
   },
   {
    "name": "stale-authorized-uninstall-refused-under-guard",
    "actualExitCode": 1,
    "expectedExitCode": 1
   },
   {
    "name": "journal-snapshot-no-service-writer-after-reinstall",
    "actualExitCode": 0,
    "expectedExitCode": 0
   },
   {
    "name": "damaged-opened-binding-fails-explicit-rollback",
    "actualExitCode": 1,
    "expectedExitCode": 1
   },
   {
    "name": "explicit-rollback-postapproval-failure-stops-owned-old-service",
    "actualExitCode": 0,
    "expectedExitCode": 0
   }
  ]
 },
 "service-security.json": [
  {
   "name": "self-hashed-alternate-service-xml",
   "passed": true
  },
  {
   "name": "installed-clr-config-tampering",
   "passed": true
  },
  {
   "name": "administrative-node-preload-not-executed",
   "passed": true
  },
  {
   "name": "administrative-node-environment-restored",
   "passed": true
  },
  {
   "name": "uninstall-requires-independent-trust",
   "passed": true,
   "exitCode": 1
  },
  {
   "name": "existing-explicit-write-grant-removed",
   "passed": true
  },
  {
   "name": "descendant-junction-refused-before-acl",
   "passed": true
  },
  {
   "name": "junction-target-acl-unchanged",
   "passed": true
  }
 ]
};
const reject=()=>{throw Error('RELEASE_SERVICE_REPORTS_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const same=(actual,expected)=>requireFact(isDeepStrictEqual(actual,expected));
// A policy helper never provides GitHub authority: expected facts must come from
// the authenticated collector and validated ZIP report in the same process.
export function readReleaseServiceReportFiles(directory,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&hash(expected?.zipSha256)&&expected.packageReportAgreement===true);
  const reader=openReleaseReportFiles(directory),data=Object.fromEntries(Object.keys(contracts).map(name=>[name,reader.json(name)]));
  for(const [name,contract]of Object.entries(contracts)){
   const value=data[name];
   if(name==='service-security.json'){requireFact(Array.isArray(value)&&value.length===contract.length);for(let i=0;i<contract.length;i++)for(const [key,wanted]of Object.entries(contract[i]))same(value[i]?.[key],wanted);continue;}
   requireFact(value.commitSha===expected.commitSha);same(value.checks,contract.checks);
   if(contract.phases){requireFact(Array.isArray(value.nativeExitCodes));same(value.nativeExitCodes.map(row=>({phase:row?.phase,exitCode:row?.exitCode})),contract.phases);for(const row of value.nativeExitCodes)requireFact(row.expectedExitCode===undefined||row.expectedExitCode===null||row.expectedExitCode===row.exitCode);}
   if(name!=='service-exit.json')requireFact(value.platform==='win32'&&value.architecture==='x64');
   if(!['service-exit.json','service-functional.json'].includes(name))requireFact(value.completed===true);
  }
  const exit=data['service-exit.json'],functional=data['service-functional.json'],credentials=data['service-credentials.json'],recovery=data['service-recovery.json'],scheduled=data['service-scheduled-backup.json'],fence=data['service-update-fence.json'],coordinator=data['service-update-coordinator.json'];
  requireFact(exit.runUrl==='https://github.com/DongVienNguyen/Family-Organizer/actions/runs/'+expected.runId&&exit.zipSha256===expected.zipSha256&&exit.exitCode===0&&exit.failure===null&&exit.fixtureCleanup===true&&exit.serviceRemoved===true&&exit.sourceCheckoutPresent===false&&exit.consumerInstall===false&&exit.consumerRebuild===false&&exit.wrapperVersion==='2.12.0'&&Number.isSafeInteger(exit.frameworkRelease)&&exit.frameworkRelease>=528040&&exit.server2019Acceptance==='not-run'&&exit.actualReboot==='not-run'&&/^FamilyOrganizer-CI[a-f0-9]{32}$/.test(exit.serviceId??''));
  same(exit.preflightNativeExitCodes,contracts['service-exit.json'].preflight);
  requireFact(functional.nodeVersion==='v24.21.0'&&hash(functional.legacySourceSha256)&&typeof functional.financeId==='string'&&functional.financeId.length>0);
  const host=credentials.powershellHost;requireFact(host?.major===5&&host.edition==='Desktop'&&host.commandModule==='Microsoft.PowerShell.Security'&&host.inputEncoding==='utf-8'&&host.inputPreamble==='EF-BB-BF'&&typeof host.securityModulePath==='string'&&host.securityModulePath.replaceAll('\\','/').toLowerCase().includes('/system32/windowspowershell/v1.0/modules/'));
  requireFact(recovery.operationInputReady===true&&Array.isArray(recovery.operationLockProbes)&&recovery.operationLockProbes.length>=5&&recovery.operationLockProbes.every(code=>code===0||code===1)&&recovery.operationLockProbes[0]===0&&recovery.operationLockProbes.at(-1)===0&&recovery.operationLockProbes.at(-2)===0&&recovery.operationLockProbes.at(-3)===0&&recovery.operationLockProbes.at(-4)===1);
  for(const row of [recovery,scheduled])requireFact(hash(row.encryptedSha256)&&Number.isSafeInteger(row.encryptedBytes)&&row.encryptedBytes>48&&row.encryptedBytes<=64*1024*1024);
  requireFact(Array.isArray(scheduled.copyAncestors)&&scheduled.copyAncestors.length===1&&scheduled.copyAncestors[0]?.path?.toLowerCase()==='c:\\');same(scheduled.reviewRegressions,contracts['service-scheduled-backup.json'].reviewRegressions);
  requireFact(fence.writesMayOpen===true&&uuid(fence.operationId)&&hash(fence.businessSha256)&&hash(fence.jobsSha256));
  requireFact(coordinator.sourceCapturePointsBefore===17&&coordinator.sourceCapturePointsAfter===17&&coordinator.explicitRollbackFaultInjected===true);
  for(const key of ['failedOperationId','operationId','rollbackOperationId'])requireFact(uuid(coordinator[key]));
  for(const key of ['candidateManifestSha256','preopenBusinessSha256','postopenBusinessSha256'])requireFact(hash(coordinator[key]));same(coordinator.reviewRefusals,contracts['service-update-coordinator.json'].reviewRefusals);
  requireFact(reader.text('coordinator-closed-storage.log').trim()==='OWNED_STORAGE_HANDLES_CLOSED');
  const logRoot=path.join(directory,'service-logs');assertNoLinkedAncestors(logRoot);requireFact(fs.lstatSync(logRoot).isDirectory());const names=fs.readdirSync(logRoot);requireFact(names.length>0&&names.length<=100&&names.every(name=>safeArchivePath(name)&&!name.includes('/'))&&names.some(name=>name.endsWith('.out.log'))&&names.some(name=>name.endsWith('.err.log')));
  let shutdownCompletions=0;for(const name of names){const text=reader.text('service-logs/'+name);if(name.endsWith('.out.log'))shutdownCompletions+=(text.match(/Shutdown complete/g)??[]).length;}
  requireFact(shutdownCompletions>=10);
  return {commitSha:expected.commitSha,runId:expected.runId,zipSha256:expected.zipSha256,rawServiceReportsVerified:true,reportsVerified:false,publicationAllowed:false,innerPackageAgreement:false,server2019Acceptance:'not-run',actualReboot:'not-run',shutdownCompletions,checks:exit.checks,coordinatorChecks:coordinator.checks,...reader.receipt()};
 }catch{reject();}
}
