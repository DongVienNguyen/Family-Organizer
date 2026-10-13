import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {validateNodeSdkReceipt} from '../ci/node-sdk-policy.mjs';
import {validateCaddyNativeEvidence} from './caddy-contract.mjs';
import {validateReleaseReportExtractionNative} from './release-report-extraction.mjs';
const reject=()=>{throw Error('RELEASE_AUXILIARY_REPORTS_REJECTED');};
const requireFact=value=>{if(!value)reject();};
// Actual named files, not uploaded summary assertions. The caller derives the
// expected source/runtime and archive root in its authenticated process.
export function readReleaseAuxiliaryFiles(directory,expected){
 try{
  const reader=openReleaseReportFiles(directory),sdk=reader.json('node-sdk.json'),probe=reader.json('caddy-native.json'),exit=reader.json('caddy-exit.json'),extraction=reader.json('release-report-extraction-native.json'),evidence=reader.json('evidence.json');
  requireFact(validateNodeSdkReceipt(sdk,expected).length===0&&validateCaddyNativeEvidence({probe,exit},expected).length===0&&validateReleaseReportExtractionNative(extraction,expected).length===0);
  requireFact(isDeepStrictEqual(sdk,evidence.nodeSdk)&&isDeepStrictEqual({probe,exit},evidence.caddy)&&isDeepStrictEqual(extraction,evidence.releaseReportExtraction));
  for(const row of [sdk,probe,exit,extraction])requireFact(!Object.hasOwn(row,'failure')&&!Object.hasOwn(row,'error'));
  return {commitSha:expected.commitSha,nodeVersion:expected.nodeVersion,rawAuxiliaryReportsVerified:true,innerPackageAgreement:false,reportsVerified:false,publicationAllowed:false,sdkHeaderSha256:sdk.headersSha256,sdkLibrarySha256:sdk.librarySha256,caddyBinarySha256:probe.binarySha256,caddyPhases:probe.phases.map(row=>row.name),extractionArchiveCount:extraction.archiveCount,extractionExpandedBytes:extraction.expandedBytes,...reader.receipt()};
 }catch{reject();}
}
