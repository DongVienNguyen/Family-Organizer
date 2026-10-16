import {isDeepStrictEqual} from 'node:util';
export const cutoverPackageFixtureVersion=13;
export const cutoverPackageChecks=Object.freeze(['exact-bundled-node-addon','explicit13-fixture-identity','authorized-readonly-family-preview','controlled-positive-cutover-pending-proof','already-disabled-family-no-task-write','authority-refusal-no-domain-write','ordinary13-restore-receipts','accepted-approval-once-successor-rotation','restart-replay-no-duplicate','encrypted13-independent-restore','wallet-board-matrix-references-preserved','old12-no-auto-upgrade','old12-future14-damaged13-refusal-no-bytes-change','offline-handles-cleanup']);
export const cutoverServerPhases=Object.freeze(['source-bootstrap','source-http13','source-ordinary-restored13','source-restarted13','target-bootstrap','target-http13-mutated','target-restored13','old12-bootstrap','old12-http12']);
export const cutoverNativePhases=Object.freeze([['source-ordinary-credential-reentry',0],['source-encrypted-backup',0],['target-encrypted-restore',0],['restored-target-backup',0],['old12-encrypted-backup',0],['old12-incompatible-restore',1],['future14-incompatible-restore',1],['damaged13-incompatible-restore',1],['target-encrypted-repair',0]]);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Data-only Windows qualification. Cloud/source builds and report flags alone
 * cannot qualify an actual ZIP: all identities, phases and refusal facts bind. */
export function validateCutoverPackageReport(report,expected){
 const errors=[],need=(value,message)=>{if(!value)errors.push(message);};
 need(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&report?.format===1&&report?.commitSha===expected.commitSha,'cutover source mismatch');
 need(hash(expected?.zipSha256)&&report?.zipSha256===expected.zipSha256,'cutover ZIP mismatch');
 need(report?.platform==='win32'&&report?.architecture==='x64'&&report?.nodeVersion==='v24.21.0'&&report?.abi==='137'&&report?.napi==='10'&&report?.nativeVersion==='13.0.3','cutover Windows native runtime mismatch');
 need(typeof expected?.nodeExecutable==='string'&&report?.nodeExecutable===expected.nodeExecutable&&hash(expected?.nodeBinarySha256)&&report?.nodeBinarySha256===expected.nodeBinarySha256&&hash(expected?.nativeBinarySha256)&&report?.nativeBinarySha256===expected.nativeBinarySha256,'cutover executable/addon mismatch');
 need(hash(report?.fixtureSha256)&&report?.fixtureCommitSha===expected?.commitSha&&report?.fixtureProducerPlatform==='win32'&&report?.fixtureProducerArchitecture==='x64'&&report?.fixtureProducerNodeVersion==='v24.21.0','cutover fixture mismatch');
 need(isDeepStrictEqual(report?.schema,{productivity:13,wallet:1})&&isDeepStrictEqual(report?.manifestBounds,{productivity:{min:1,max:13},wallet:{min:1,max:1}}),'cutover schema mismatch');
 need(isDeepStrictEqual(report?.checks,[...cutoverPackageChecks]),'cutover checks incomplete');
 need(isDeepStrictEqual(report?.serverExits,cutoverServerPhases.map(phase=>({phase,exitCode:0,signal:null}))),'cutover server phases incomplete');
 need(isDeepStrictEqual(report?.nativeExitCodes,cutoverNativePhases.map(([phase,exitCode])=>({phase,exitCode,signal:null}))),'cutover native phases incomplete');
 need(isDeepStrictEqual(report?.refusals,['old12','future14','damaged13'].map(kind=>({kind,exitCode:1,databaseBytesPreserved:true,nativeHandlesClosed:true,journal:'delete'}))),'cutover refusal facts incomplete');
 need(isDeepStrictEqual(report?.positive,{pendingProofPreserved:true,canonicalFieldsPreserved:true,legacyHistoryPreserved:true,oldGeneratorsStopped:2,acceptedCount:0,noRewardsOrSuccessor:true}),'cutover positive-family invariants missing');
 need(isDeepStrictEqual(report?.disabled,{linkedHistoricalMembers:2,changedTaskRows:0,acceptedCount:0,provenanceRecorded:true,noRewardsOrSuccessor:true}),'cutover disabled-family invariants missing');
 need(isDeepStrictEqual(report?.approval,{grantPoints:35,grantCount:1,successorCount:1,acceptedCount:1,rotationCursor:1,sameUuidReplay:true,newUuidNoOp:true,restartReplay:true}),'cutover approval invariants missing');
 need(isDeepStrictEqual(report?.authorityRefusals,[401,403,403,403]),'cutover role refusal matrix incomplete');
 need(hash(report?.ordinarySnapshotChecksum)&&hash(report?.encryptedSha256),'cutover recovery hashes missing');
 for(const key of ['previewReadOnly','old12IdentityAndDdlUnchanged','boardReferencesPreserved','targetReferencesReplaced','walletExactStrings','matrixPinsPreserved','sessionRevoked','noRestoreReplay','nativeHandlesClosed','fixtureRemoved','completed'])need(report?.[key]===true,'cutover missing '+key);
 need(isDeepStrictEqual(report?.networkAttempts,[])&&report?.consumerInstall===false&&report?.consumerRebuild===false&&report?.server2019Acceptance==='not-run'&&!Object.hasOwn(report??{},'failure'),'cutover isolation/completion mismatch');
 return errors;
}
