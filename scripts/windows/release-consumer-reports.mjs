import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateReleaseProductionReport} from './release-runtime-reports.mjs';
const rules={
  "package-functional.json": {
    "checks": [
      "legacy-migration-source-preserved",
      "finance-create-read-update",
      "task-reward-once",
      "restart-preserves-finance-reward",
      "finance-delete",
      "ordinary-backup-excludes-credentials",
      "restore-requires-explicit-credential-reentry",
      "compiled-offline-reentry-preserves-user-ids",
      "shared-snapshot-restore",
      "restore-revokes-session",
      "restore-preserves-reward-no-replay",
      "snapshot-core-rows-preserved",
      "offline-providers",
      "native-handles-closed",
      "compiled-canonical-task-http-restart-snapshot-recovery",
      "compiled-canonical-unsupported-migration-refusal"
    ]
  },
  "package-recovery.json": {
    "checks": [
      "compiled-recovery-whole-release-excluded",
      "compiled-recovery-encrypted-no-key-plaintext",
      "compiled-recovery-authentication-before-mutation",
      "compiled-portable-restore-ids-finance-reward-media",
      "compiled-recovery-no-claim-command-replay",
      "compiled-recovery-native-handles-closed"
    ],
    "nativeExitCodes": [
      {
        "phase": "release-root-refusal",
        "exitCode": 1
      },
      {
        "phase": "release-bin-refusal",
        "exitCode": 1
      },
      {
        "phase": "release-ops-refusal",
        "exitCode": 1
      },
      {
        "phase": "encrypted-backup",
        "exitCode": 0
      },
      {
        "phase": "target-initialize",
        "exitCode": 0
      },
      {
        "phase": "wrong-key",
        "exitCode": 1
      },
      {
        "phase": "tampered-ciphertext",
        "exitCode": 1
      },
      {
        "phase": "portable-restore",
        "exitCode": 0
      }
    ]
  },
  "package-private-settings.json": {
    "checks": [
      "compiled-explicit-settings-encrypted-no-plaintext",
      "compiled-selected-settings-wrong-key-no-mutation",
      "compiled-authenticated-invalid-snapshot-unwarmed-schema-rows-journal-files-preserved",
      "compiled-selected-subset-unselected-settings-retained",
      "compiled-private-settings-business-claims-session-preserved",
      "compiled-private-settings-offline-source-retained-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "selected-backup",
        "exitCode": 0
      },
      {
        "phase": "target-initialize",
        "exitCode": 0
      },
      {
        "phase": "wrong-key",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-manifest",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-checksum",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-primary-key",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-migrations",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-credentials",
        "exitCode": 1
      },
      {
        "phase": "selected-restore",
        "exitCode": 0
      }
    ]
  },
  "package-signing-key.json": {
    "checks": [
      "compiled-explicit-signing-key-encrypted-no-plaintext",
      "compiled-signing-key-wrong-key-missing-selection-no-mutation",
      "compiled-unselected-signing-key-retained",
      "compiled-selected-signing-key-business-claims-sessions-preserved",
      "compiled-selected-signing-key-removal-provider-env-retained",
      "compiled-signing-key-offline-source-retained-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "signing-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "signing-wrong-key",
        "exitCode": 1
      },
      {
        "phase": "signing-raw-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-missing-group",
        "exitCode": 1
      },
      {
        "phase": "signing-omitted",
        "exitCode": 0
      },
      {
        "phase": "signing-selected",
        "exitCode": 0
      },
      {
        "phase": "signing-absent-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-absent-restore",
        "exitCode": 0
      }
    ]
  },
  "package-provider-env.json": {
    "checks": [
      "compiled-explicit-provider-env-encrypted-no-plaintext",
      "compiled-provider-env-wrong-key-missing-selection-no-mutation",
      "compiled-unselected-provider-env-bytes-retained",
      "compiled-provider-env-subset-vapid-pair-host-text-preserved",
      "compiled-provider-env-business-claims-sessions-source-preserved",
      "compiled-selected-provider-env-removal-unselected-values-retained",
      "compiled-provider-env-offline-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "env-backup",
        "exitCode": 0
      },
      {
        "phase": "env-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "env-wrong-key",
        "exitCode": 1
      },
      {
        "phase": "env-raw-backup",
        "exitCode": 0
      },
      {
        "phase": "env-missing-group",
        "exitCode": 1
      },
      {
        "phase": "env-omitted",
        "exitCode": 0
      },
      {
        "phase": "env-gemini-selected",
        "exitCode": 0
      },
      {
        "phase": "env-vapid-selected",
        "exitCode": 0
      },
      {
        "phase": "env-absent-backup",
        "exitCode": 0
      },
      {
        "phase": "env-absent-restore",
        "exitCode": 0
      }
    ]
  },
  "package-online-recovery.json": {
    "checks": [
      "compiled-online-live-wal-selected-secrets-encrypted",
      "compiled-online-failed-capture-keeps-runtime-and-prior-output",
      "compiled-online-native-denied-output-keeps-runtime",
      "compiled-online-concurrent-exclusive-publication",
      "compiled-online-later-http-write-owner-retained",
      "compiled-online-shutdown-fence-drained",
      "compiled-online-shared-offline-restore-point-in-time-claims-config-sessions",
      "compiled-online-overlapping-live-writer-snapshot-consistent",
      "compiled-online-offline-network-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "online-live-capture",
        "exitCode": 0
      },
      {
        "phase": "online-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "online-offline-restore",
        "exitCode": 0
      },
      {
        "phase": "online-overlap-restore",
        "exitCode": 0
      }
    ]
  }
};
const reject=()=>{throw Error('RELEASE_CONSUMER_REPORTS_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
// Raw reports remain data and must come from the authenticated archive flow.
// Inner package/license bytes and all service reports are separate gates.
export function readReleaseConsumerReportFiles(directory,packageReports,expected){
 try{
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&Number.isSafeInteger(expected?.runId)&&expected.runId>0&&packageReports?.packageReportAgreement===true&&packageReports.commitSha===expected.commitSha&&packageReports.runId===expected.runId&&hash(packageReports.zipSha256)&&typeof packageReports.validation?.nodeExecutable==='string');
  const reader=openReleaseReportFiles(directory),reports={};
  for(const [name,rule]of Object.entries(rules)){
   const row=reader.json(name);reports[name]=row;
   requireFact(row.commitSha===expected.commitSha&&row.nodeVersion==='v24.21.0'&&row.platform==='win32'&&row.architecture==='x64'&&row.nodeExecutable===packageReports.validation.nodeExecutable&&!Object.hasOwn(row,'failure'));
   requireFact(isDeepStrictEqual(row.checks,rule.checks));
   if(name==='package-functional.json'){
    requireFact(Array.isArray(row.networkAttempts)&&row.networkAttempts.length===0&&hash(row.snapshotChecksum));
    const p=row.productivity;
    requireFact(p?.completed===true&&isDeepStrictEqual(p.structureStorage,{version:2,checklistPreserved:true,catalogPreserved:true,v1StartupWithoutUpgrade:true})&&p.fixtureCommitSha===expected.commitSha&&isDeepStrictEqual(p.taskIds,['canonical-parent','canonical-task'])&&p.rawTaskRows===0&&p.malformedCurrentTaskRepaired===true&&isDeepStrictEqual(p.semanticCommands,{httpEnabled:true,noneCreated:true,legacyFullFormPreserved:true,staleRevisionRefused:true,forgedFieldsRefused:true,restartPreserved:true})&&Number.isSafeInteger(p.revision)&&p.revision>0&&hash(p.snapshotChecksum)&&hash(p.encryptedSha256)&&p.nativeHandlesClosed===true&&Array.isArray(p.networkAttempts)&&p.networkAttempts.length===0);
    requireFact(isDeepStrictEqual(p.sparseCoreRefusal,{exitCode:1,databaseBytesPreserved:true,nativeHandlesClosed:true,journal:'delete',tableCount:2}));
    requireFact(isDeepStrictEqual(p.refusalCases,['changed-checksum','future-version','unknown-namespace'].map(kind=>({kind,exitCode:1,databaseBytesPreserved:true,nativeHandlesClosed:true,journal:'delete'}))));
   }
   else requireFact(row.completed===true&&hash(row.encryptedSha256)&&isDeepStrictEqual(row.nativeExitCodes,rule.nativeExitCodes));
   if(name==='package-recovery.json')requireFact(Number.isSafeInteger(row.encryptedBytes)&&row.encryptedBytes>0&&row.encryptedBytes<=64*1024*1024);
  }
  const production=reader.json('production.json'),node=packageReports.validation.nodeExecutable;
  const productionRoot=path.win32.join(path.win32.dirname(path.win32.dirname(node)),'app');
  requireFact(validateReleaseProductionReport(production,{commitSha:expected.commitSha,nodeVersion:'v24.21.0',productionRoot}).length===0);
  return {commitSha:expected.commitSha,runId:expected.runId,zipSha256:packageReports.zipSha256,rawConsumerFunctionalReportsVerified:true,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false,checks:Object.fromEntries(Object.entries(reports).map(([name,row])=>[name,row.checks])),compiledProductionChecks:production.checks,incompatibleSchemaCases:production.incompatibleSchemas.map(row=>row.name),...reader.receipt()};
 }catch{reject();}
}
