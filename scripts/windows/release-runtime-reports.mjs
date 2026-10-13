import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {safeArchivePath} from './package-contract.mjs';
import {openReleaseReportFiles} from './release-report-files.mjs';
export const legacyProductionChecks=Object.freeze(['production-dependencies-only','no-source-ts','foreign-cwd','static-assets','legacy-preserved','restart-persistence','write-permission-fail-fast','offline-providers','graceful-shutdown','readiness','crash-recovery','auth-session-restart','auth-session-logout','private-response-cache','authenticated-realtime','object-visibility','authenticated-media','task-write-authority','content-write-authority','derived-object-privacy','explicit-first-account','provider-digest-privacy','incompatible-schema-preserved']);
export const windowsSqliteBinarySha256='e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a';
const nativeChecks=['native-load','write-read','transaction-rollback','WAL-backup','integrity-check','file-cleanup'];
const schemas=['future','missing-version','foreign','sqliteX','sqliteData','malformed-metadata','malformed-owned-table'];
const sameSet=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===actual.length&&expected.every(name=>actual.includes(name));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const windows=value=>value?.platform==='win32'&&value?.architecture==='x64';
// Data policy only. The adapter must obtain these bytes from authenticated
// archives and the expected context from the target Git policy, in one process.
export function validateReleaseRuntimeReports(input){
 const errors=[],require=(ok,name)=>{if(!ok)errors.push(name);};
 try{
  const {expected:e,native:n,production:p,audit:a,auditContext:c,evidence:q}=input??{};
  require(/^[a-f0-9]{40}$/.test(e?.commitSha??'')&&hash(e?.lockSha256)&&['v22.23.3','v24.21.0'].includes(e?.nodeVersion),'invalid runtime report context');
  for(const [name,value]of Object.entries({native:n,production:p,audit:a,auditContext:c}))require(isDeepStrictEqual(value,q?.[name]),'raw '+name+' contradicts quality receipt');
  require(windows(n)&&n?.nodeVersion===e?.nodeVersion&&n?.nodeABI===(e?.nodeVersion==='v22.23.3'?'127':'137')&&n?.addonVersion==='13.0.3'&&n?.bindingApi==='N-API'&&n?.nodeNapi==='10'&&n?.binaryPath==='prebuilds/win32-x64.node'&&n?.sqliteVersion==='3.53.4'&&n?.binarySha256===windowsSqliteBinarySha256,'unpinned native runtime/binary');
  require(sameSet(n?.checks,nativeChecks),'native checks incomplete/duplicate');
  require(windows(p)&&p?.commitSha===e?.commitSha&&p?.nodeVersion===e?.nodeVersion&&p?.cwd==='C:\\Windows\\System32','compiled production identity/cwd mismatch');
  const root=p?.productionRoot;
  require(typeof root==='string'&&/^[a-z]:\\/i.test(root)&&path.win32.normalize(root)===root&&safeArchivePath(root.slice(3).replaceAll('\\','/'))&&root.includes('dữ liệu')&&root.endsWith('\\release with spaces'),'compiled synthetic Unicode/spaces root mismatch');
  require(sameSet(p?.checks,legacyProductionChecks),'compiled production checks incomplete/duplicate');
  const cases=p?.incompatibleSchemas;require(Array.isArray(cases)&&sameSet(cases.map(item=>item?.name),schemas),'missing/duplicate incompatible schema cases');
  for(const item of cases??[])require(item?.exitCode===1&&item?.bytesSchemaRowsJournalPreserved===true&&item?.nativeHandlesReleased===true&&item?.journal==='delete'&&hash(item?.databaseSha256)&&Array.isArray(item?.networkAttempts)&&item.networkAttempts.length===0,'incompatible schema did not preserve bytes/rows/journal/handles/offline boundary');
  require(a!==null&&typeof a==='object'&&!Array.isArray(a)&&!a.error&&a.vulnerabilities!==null&&typeof a.vulnerabilities==='object'&&!Array.isArray(a.vulnerabilities)&&Object.keys(a.vulnerabilities).length===0&&['info','low','moderate','high','critical','total'].every(name=>a.metadata?.vulnerabilities?.[name]===0),'audit missing/error/remaining vulnerabilities');
  require(windows(c)&&c?.commitSha===e?.commitSha&&c?.nodeVersion===e?.nodeVersion&&c?.lockSha256===e?.lockSha256,'audit runtime/source/lock context mismatch');
 }catch{errors.push('malformed native/runtime/audit reports');}return errors;
}
export function readReleaseRuntimeFiles(directory,expected){
 try{
  const reader=openReleaseReportFiles(directory),native=reader.json('native.json'),production=reader.json('production.json'),audit=reader.json('audit.json'),auditContext=reader.json('audit-context.json'),evidence=reader.json('evidence.json');
  if(validateReleaseRuntimeReports({expected,native,production,audit,auditContext,evidence}).length)throw Error();
  return {commitSha:expected.commitSha,nodeVersion:expected.nodeVersion,runtimeProductionAuditVerified:true,reportsVerified:false,publicationAllowed:false,native,productionChecks:production.checks,incompatibleSchemaCases:production.incompatibleSchemas.map(row=>row.name),auditVulnerabilities:audit.metadata.vulnerabilities,...reader.receipt()};
 }catch{throw Error('RELEASE_RUNTIME_FILES_REJECTED');}
}
