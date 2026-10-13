import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as contract from '../scripts/windows/release-quality-reports.mjs';
const sha='a'.repeat(40), lock='b'.repeat(64), runId=42;
function fixture(){
 const assertions=['first assertion','second assertion'].map(fullName=>({fullName,ancestorTitles:[],title:fullName,status:'passed',failureMessages:[]}));
 const suite={name:'server/synthetic.test.ts',passed:2,failed:0,skipped:0};
 return {expected:{commitSha:sha,runId,major:24,lockSha256:lock,requiredSuites:[suite.name]},evidence:{commitSha:sha,workflowRunUrl:`https://github.com/DongVienNguyen/Family-Organizer/actions/runs/${runId}`,runAttempt:1,runnerOS:'Windows_NT 10.0.20348',nodeVersion:'v24.21.0',npmVersion:'11.19.0',lockSha256:lock,server2019Acceptance:'not-run',checks:Object.fromEntries(['install','native','lint','test','build','production','audit','coverage'].map(n=>[n,'success'])),errors:[],suites:[suite]},tests:{success:true,numTotalTests:2,numPassedTests:2,numFailedTests:0,numPendingTests:0,numTodoTests:0,numTotalTestSuites:1,numPassedTestSuites:1,numFailedTestSuites:0,numPendingTestSuites:0,testResults:[{name:'D:/a/Family-Organizer/Family-Organizer/'+suite.name,status:'passed',assertionResults:assertions}]},junit:`<?xml version="1.0"?><testsuites tests="2" failures="0" errors="0"><testsuite name="${suite.name}" tests="2" failures="0" errors="0" skipped="0"><testcase classname="${suite.name}" name="first assertion"></testcase><testcase classname="${suite.name}" name="second assertion"></testcase></testsuite></testsuites>`,exits:Object.fromEntries(['install','native','lint','test','build','production','audit','coverage'].map(n=>[n,{exitCode:0,...(n==='audit'?{nativeAuditExitCode:0}:{}),...(n==='coverage'?{nativeCoverageExitCode:0}:{})}]))};
}
const validate=(v:any)=>(contract as any).validateReleaseQualityReports(v);
describe('raw authenticated quality report agreement',()=>{
 it('accepts matching raw assertion/JUnit/evidence identity without claiming Server2019',()=>expect(validate(fixture())).toEqual([]));
 it.each(['commitSha','lockSha256','workflowRunUrl','runAttempt','runnerOS','nodeVersion','npmVersion','server2019Acceptance'])('rejects foreign quality identity %s',key=>{const v:any=fixture();v.evidence[key]='foreign';expect(validate(v).length).toBeGreaterThan(0);});
 it.each(['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests','numFailedTestSuites','numPendingTestSuites'])('rejects contradictory raw counter %s',key=>{const v=fixture();(v.tests as any)[key]++;expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects empty required-suite policy',()=>{const v=fixture();v.expected.requiredSuites=[];expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects missing critical suite even when all claimed tests pass',()=>{const v=fixture();v.expected.requiredSuites.push('server/critical.test.ts');expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects duplicate JSON suite identity',()=>{const v=fixture();v.tests.testResults.push(structuredClone(v.tests.testResults[0]));expect(validate(v).length).toBeGreaterThan(0);});
 it.each(['failed','pending','todo','skipped'])('rejects individual raw assertion %s despite green aggregate',status=>{const v=fixture();v.tests.testResults[0].assertionResults[0].status=status;expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects raw assertion failures hidden under passed status',()=>{const v=fixture();(v.tests.testResults[0].assertionResults[0].failureMessages as string[]).push('synthetic failure');expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects duplicate assertion identities with unchanged aggregate',()=>{const v=fixture();v.tests.testResults[0].assertionResults[1].fullName='first assertion';expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects suite receipt inconsistent with actual assertions',()=>{const v=fixture();v.evidence.suites[0].passed++;expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects replaced JUnit assertion with same counts',()=>{const v=fixture();v.junit=v.junit.replace('name="second assertion"','name="foreign assertion"');expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects duplicated JUnit assertion with same counts',()=>{const v=fixture();v.junit=v.junit.replace('name="second assertion"','name="first assertion"');expect(validate(v).length).toBeGreaterThan(0);});
 it.each(['failure','error','skipped'])('rejects JUnit %s hidden under zero aggregate',tag=>{const v=fixture();v.junit=v.junit.replace('</testcase>',`<${tag}/></testcase>`);expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects JUnit DTD/entity',()=>{const v=fixture();v.junit='<!DOCTYPE testsuites [<!ENTITY x "first assertion">]>'+v.junit;expect(validate(v).length).toBeGreaterThan(0);});
 it('decodes escaped XML assertion identity once',()=>{const v=fixture();v.tests.testResults[0].assertionResults[0].fullName='first > assertion & text';v.tests.testResults[0].assertionResults[0].title='first > assertion & text';v.junit=v.junit.replace('first assertion','first &gt; assertion &amp; text');expect(validate(v)).toEqual([]);});
 it('rejects malformed unknown XML entity',()=>{const v=fixture();v.junit=v.junit.replace('first assertion','first &foreign; assertion');expect(validate(v).length).toBeGreaterThan(0);});
 it.each(['install','native','lint','test','build','production','audit','coverage'])('rejects missing/nonzero native exit %s',name=>{const v=fixture();delete (v.exits as any)[name];expect(validate(v).length).toBeGreaterThan(0);const other=fixture();(other.exits as any)[name].exitCode=1;expect(validate(other).length).toBeGreaterThan(0);});
 it('rejects nonzero underlying audit/coverage commands',()=>{for(const [name,key]of [['audit','nativeAuditExitCode'],['coverage','nativeCoverageExitCode']]){const v=fixture();(v.exits as any)[name][key]=1;expect(validate(v).length).toBeGreaterThan(0);}});
 it('rejects skipped required quality step',()=>{const v=fixture();v.evidence.checks.test='skipped';expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects extra undeclared quality step',()=>{const v=fixture();(v.evidence.checks as any).foreign='success';expect(validate(v).length).toBeGreaterThan(0);});
 it('rejects malformed raw objects rather than accepting a receipt',()=>{for(const key of ['tests','evidence','exits']){const v:any=fixture();v[key]=null;expect(validate(v).length).toBeGreaterThan(0);}});
});

it('matches reporter ancestor/title separators rather than ambiguous fullName whitespace',()=>{const v=fixture();const a=v.tests.testResults[0].assertionResults[0];a.ancestorTitles=['synthetic group'];a.fullName='synthetic group first assertion';v.junit=v.junit.replace('name="first assertion"','name="synthetic group &gt; first assertion"');expect(validate(v)).toEqual([]);});
it('retains exact multiplicity of legitimate parameterized assertion names',()=>{const v=fixture();const a=v.tests.testResults[0].assertionResults; a[1]=structuredClone(a[0]);v.junit=v.junit.replace('name="second assertion"','name="first assertion"');expect(validate(v)).toEqual([]);});
it('rejects an undeclared testcase hidden inside JUnit properties',()=>{const v=fixture();v.junit=v.junit.replace('</testsuite>','<properties><testcase classname="server/synthetic.test.ts" name="hidden"/></properties></testsuite>');expect(validate(v).length).toBeGreaterThan(0);});
it('rejects nested JUnit suites inside captured output',()=>{const v=fixture();v.junit=v.junit.replace('</testcase>','<system-out><testsuite name="hidden"/></system-out></testcase>');expect(validate(v).length).toBeGreaterThan(0);});

it.each(['numTotalTestSuites','numPassedTestSuites'])('rejects contradictory raw suite-group counter %s',key=>{const v=fixture();(v.tests as any)[key]++;expect(validate(v).length).toBeGreaterThan(0);});

it('rejects a100KB malformed whitespace token within a bounded child process',()=>{
 const moduleUrl=new URL('../scripts/windows/release-quality-reports.mjs',import.meta.url).href;
 const code=`import {validateReleaseQualityReports} from ${JSON.stringify(moduleUrl)};const errors=validateReleaseQualityReports({junit:'<testsuites'+' '.repeat(100000)+'!'});if(!errors.length)process.exit(2);console.log('MALFORMED_XML_REJECTED');`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{timeout:3000,maxBuffer:8192,encoding:'utf8'});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.signal).toBeNull();expect(child.stdout.trim()).toBe('MALFORMED_XML_REJECTED');
},5000);
it.each([
 ['invalid declaration',(v:any)=>v.junit=v.junit.replace('<?xml version="1.0"?>','<?xmlbanana arbitrary gibberish?>')],
 ['literal NUL text',(v:any)=>v.junit=v.junit.replace('</testcase>','<system-out>\u0000</system-out></testcase>')],
 ['forbidden numeric XML character',(v:any)=>v.junit=v.junit.replace('</testcase>','<system-out>&#xFFFF;</system-out></testcase>')],
 ['invalid self-closing token',(v:any)=>v.junit=v.junit.replace('</testcase>','<system-out/ ></testcase>')],
 ['literal forbidden attribute character',(v:any)=>v.junit=v.junit.replace('<testsuite name=','<testsuite hostname="synthetic\uFFFE" name=')],
 ['forbidden CDATA character',(v:any)=>v.junit=v.junit.replace('</testcase>','<system-out><![CDATA[\u0000]]></system-out></testcase>')],
])('rejects malformed XML %s',(_name,mutate)=>{const v=fixture();mutate(v);expect(validate(v).length).toBeGreaterThan(0);});
