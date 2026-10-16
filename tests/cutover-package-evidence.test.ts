import {cutoverReportFixture as fixture}from'./helpers/cutover-package-fixture.js';
import {expect,it} from 'vitest';
import {cutoverPackageChecks,cutoverServerPhases,cutoverNativePhases,validateCutoverPackageReport} from '../scripts/windows/cutover-package-contract.mjs';
const sha='a'.repeat(40),zip='b'.repeat(64),node='c'.repeat(64),addon='d'.repeat(64),exe='D:\\synthetic\\release with spaces\\bin\\node.exe';
const expected={commitSha:sha,zipSha256:zip,nodeExecutable:exe,nodeBinarySha256:node,nativeBinarySha256:addon};
it('requires all exact13 ZIP phases and qualified native identities',()=>expect(validateCutoverPackageReport(fixture(),expected)).toEqual([]));
it.each(['commitSha','zipSha256','nodeBinarySha256','nativeBinarySha256','fixtureCommitSha'])('rejects mismatched %s identity',key=>{const f:any=fixture();f[key]='0'.repeat(key.endsWith('Sha')?40:64);expect(validateCutoverPackageReport(f,expected).length).toBeGreaterThan(0);});
it.each(['positive','disabled','approval','checks','serverExits','nativeExitCodes','refusals'])('rejects missing %s evidence',key=>{const f:any=fixture();delete f[key];expect(validateCutoverPackageReport(f,expected).length).toBeGreaterThan(0);});
it.each(['linux','darwin'])('never qualifies Cloud %s as Windows evidence',platform=>{expect(validateCutoverPackageReport({...fixture(),platform},expected).length).toBeGreaterThan(0);});
it.each([12,14])('rejects unsupported schema%s',version=>{const f=fixture();f.schema.productivity=version;expect(validateCutoverPackageReport(f,expected).length).toBeGreaterThan(0);});
it.each(['previewReadOnly','old12IdentityAndDdlUnchanged','boardReferencesPreserved','targetReferencesReplaced','walletExactStrings','matrixPinsPreserved','sessionRevoked','noRestoreReplay','nativeHandlesClosed','fixtureRemoved','completed'])('rejects missing %s guarantee',key=>{const f:any=fixture();f[key]=false;expect(validateCutoverPackageReport(f,expected).length).toBeGreaterThan(0);});
it('rejects skipped native cleanup retry point replay and actual Server2019 claims',()=>{for(const patch of [{serverExits:[]},{nativeExitCodes:[]},{networkAttempts:['synthetic-provider-attempt']},{consumerInstall:true},{consumerRebuild:true},{server2019Acceptance:'passed'},{failure:'synthetic failure'},{approval:{...fixture().approval,grantCount:2}},{positive:{...fixture().positive,pendingProofPreserved:false}}])expect(validateCutoverPackageReport({...fixture(),...patch},expected).length).toBeGreaterThan(0);});

it('rejects source-only native scenario evidence even on a Windows host',()=>expect(validateCutoverPackageReport({...fixture(),provenance:'scenario-only'},expected).length).toBeGreaterThan(0));
