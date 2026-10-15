import {isDeepStrictEqual} from 'node:util';
export const boardPackageChecks=Object.freeze(['exact-bundled-node-addon','explicit8-fixture-identity','current8-http-config-and-reference','canonical-hard-wip-no-task-write','child-private-task-exclusion','ordinary8-snapshot-restore','credential-reentry-preserves-ids','encrypted8-independent-restore','wallet-matrix-board-references-preserved','old7-no-auto-upgrade','old7-refusal-preserves-bytes','future9-refusal-preserves-bytes','index-refusal-preserves-bytes','offline-handles-cleanup']);
export const boardServerPhases=Object.freeze(['source-bootstrap','source-http8','source-restarted8','source-ordinary-restored8','target-bootstrap','target-http8-mutated','target-restored8','old7-bootstrap','old7-http7']);
export const boardNativePhases=Object.freeze([['source-ordinary-credential-reentry',0],['source-encrypted-backup',0],['target-encrypted-restore',0],['restored-target-backup',0],['old7-encrypted-backup',0],['old7-incompatible-restore',1],['future9-incompatible-restore',1],['missing-index-incompatible-restore',1]]);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Raw evidence stays untrusted data; all identities, phases and refusal facts bind
 * to the independently verified package, never just a completed/build flag. */
export function validateBoardPackageReport(report,expected){
 const errors=[],require=(value,message)=>{if(!value)errors.push(message);};
 require(report?.format===1&&/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&report?.commitSha===expected.commitSha,'board report source mismatch');
 require(hash(expected?.zipSha256)&&report?.zipSha256===expected.zipSha256,'board report ZIP mismatch');
 require(report?.platform==='win32'&&report?.architecture==='x64'&&report?.nodeVersion==='v24.21.0'&&report?.abi==='137'&&report?.napi==='10'&&report?.nativeVersion==='13.0.3','board report native runtime mismatch');
 require(typeof expected?.nodeExecutable==='string'&&report?.nodeExecutable===expected.nodeExecutable&&hash(expected?.nodeBinarySha256)&&report?.nodeBinarySha256===expected.nodeBinarySha256&&hash(expected?.nativeBinarySha256)&&report?.nativeBinarySha256===expected.nativeBinarySha256,'board report executable/addon mismatch');
 require(hash(report?.fixtureSha256)&&report?.fixtureCommitSha===expected?.commitSha&&report?.fixtureProducerPlatform==='win32'&&report?.fixtureProducerArchitecture==='x64'&&report?.fixtureProducerNodeVersion==='v24.21.0','board report fixture mismatch');
 require(isDeepStrictEqual(report?.schema,{productivity:8,wallet:1})&&isDeepStrictEqual(report?.manifestBounds,{productivity:{min:1,max:8},wallet:{min:1,max:1}}),'board report schema mismatch');
 require(isDeepStrictEqual(report?.checks,[...boardPackageChecks]),'board report checks incomplete');
 require(isDeepStrictEqual(report?.serverExits,boardServerPhases.map(phase=>({phase,exitCode:0,signal:null}))),'board report server phases incomplete');
 require(isDeepStrictEqual(report?.nativeExitCodes,boardNativePhases.map(([phase,exitCode])=>({phase,exitCode,signal:null}))),'board report native phases incomplete');
 require(isDeepStrictEqual(report?.refusals,['old7','future9','missing-index'].map(kind=>({kind,exitCode:1,databaseBytesPreserved:true,nativeHandlesClosed:true,journal:'delete'}))),'board report refusal facts incomplete');
 require(hash(report?.ordinarySnapshotChecksum)&&hash(report?.encryptedSha256),'board report backup checksums missing');
 for(const field of ['old7MigrationIdentityAndDdlUnchanged','taskRowsPreserved','sourceReferencePreserved','targetReferenceReplaced','walletExactStrings','matrixPinsPreserved','sessionRevoked','noRewardOrNotificationReplay','nativeHandlesClosed','fixtureRemoved','completed'])require(report?.[field]===true,'board report missing '+field);
 require(isDeepStrictEqual(report?.networkAttempts,[])&&report?.consumerInstall===false&&report?.consumerRebuild===false&&report?.server2019Acceptance==='not-run'&&!Object.hasOwn(report??{},'failure'),'board report isolation/completion mismatch');
 return errors;
}
