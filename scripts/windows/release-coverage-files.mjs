import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openReleaseReportFiles} from './release-report-files.mjs';
import {safeArchivePath} from './package-contract.mjs';
import {validateCoverageReports} from '../ci/coverage-contract.mjs';
const reject=()=>{throw Error('RELEASE_COVERAGE_FILES_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=value=>createHash('sha256').update(value).digest('hex');
export function readReleaseCoverageFiles(directory,policy,expected,evidence){
 try{
  const reader=openReleaseReportFiles(directory),coverage=reader.json('coverage-evidence.json');
  requireFact(/^[a-f0-9]{40}$/.test(expected?.commitSha??'')&&['v22.23.3','v24.21.0'].includes(expected?.nodeVersion));
  requireFact(isDeepStrictEqual(coverage,evidence?.coverage)&&coverage.commitSha===expected.commitSha&&coverage.nodeVersion===expected.nodeVersion&&coverage.platform==='win32'&&coverage.architecture==='x64'&&coverage.providerVersion===policy?.coveragePolicy?.providerVersion&&coverage.providerVersion==='4.1.11'&&coverage.lockSha256===policy?.lockSha256&&coverage.baselineSha256===policy?.coveragePolicySha256);
  requireFact(Array.isArray(coverage.errors)&&coverage.errors.length===0&&Array.isArray(policy?.sourceInventory)&&policy.sourceInventory.length>0&&isDeepStrictEqual(coverage.sourceInventory,policy.sourceInventory)&&coverage.sourceInventorySha256===hash(JSON.stringify(policy.sourceInventory)));
  const floor=policy.coveragePolicy.floors?.[expected.nodeVersion];requireFact(isDeepStrictEqual(coverage.floor,floor));
  const full=reader.json('coverage/coverage-final.json'),summary=reader.json('coverage/coverage-summary.json'),lcov=reader.text('coverage/lcov.info');reader.text('coverage/index.html');
  const hashes=reader.receipt().reportHashes;
  requireFact(Object.keys(coverage.reportHashes??{}).length===4&&['coverage-final.json','coverage-summary.json','lcov.info','index.html'].every(name=>coverage.reportHashes[name]===hashes['coverage/'+name]));
  const names=policy.sourceInventory.map(row=>row.path);requireFact(new Set(names).size===names.length);
  const source=value=>{
   requireFact(typeof value==='string');const normalized=value.replaceAll('\\','/'),relative=/^[a-z]:\//i.test(normalized)?normalized.slice(3):normalized;requireFact(safeArchivePath(relative));
   const matches=names.filter(name=>normalized===name||normalized.endsWith('/'+name));requireFact(matches.length===1);return matches[0];
  };
  const normalizedFull={};for(const [key,value]of Object.entries(full)){const name=source(key);requireFact(!Object.hasOwn(normalizedFull,name)&&source(value?.path)===name);normalizedFull[name]={...value,path:name};}
  const normalizedSummary={};for(const [key,value]of Object.entries(summary)){const name=key==='total'?'total':source(key);requireFact(!Object.hasOwn(normalizedSummary,name));normalizedSummary[name]=value;}
  requireFact(isDeepStrictEqual(coverage.total,normalizedSummary.total)&&validateCoverageReports({summary:normalizedSummary,full:normalizedFull,lcov,sourceFiles:names,floor}).length===0);
  return {commitSha:expected.commitSha,nodeVersion:expected.nodeVersion,coverageVerified:true,reportsVerified:false,publicationAllowed:false,sources:names.length,total:normalizedSummary.total,...reader.receipt()};
 }catch{reject();}
}
