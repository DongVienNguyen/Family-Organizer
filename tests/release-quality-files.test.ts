import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {releaseQualityFixture} from './helpers/release-quality-fixture';
import * as files from '../scripts/windows/release-report-files.mjs';
const roots:string[]=[];
const steps=['install','native','lint','test','build','production','audit','coverage'];
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'release raw assertions '));roots.push(root);const value=releaseQualityFixture();for(const [name,data] of Object.entries({'evidence.json':value.evidence,'vitest.json':value.tests,...Object.fromEntries(steps.map(name=>[name+'-exit.json',value.exits[name as keyof typeof value.exits]]))}))fs.writeFileSync(path.join(root,name),JSON.stringify(data));fs.writeFileSync(path.join(root,'junit.xml'),value.junit);return {root,value};}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const collect=(f:ReturnType<typeof fixture>)=>(files as any).readReleaseQualityFiles(f.root,f.value.expected);
it('binds actual JSON/JUnit assertions and native exit files without claiming full release evidence',()=>{const f=fixture(),actual=collect(f);expect(actual).toMatchObject({tests:2,passed:2,files:1,failed:0,pending:0,todo:0,rawAssertionsVerified:true,otherReportsVerified:false,publicationAllowed:false});expect(actual.reportHashes).toHaveProperty('junit.xml');});
it.each(['vitest.json','junit.xml','evidence.json','audit-exit.json','coverage-exit.json'])('refuses omitted actual report %s',name=>{const f=fixture();fs.unlinkSync(path.join(f.root,name));expect(()=>collect(f)).toThrow('RELEASE_REPORT_FILES_REJECTED');});
it('refuses hidden failed assertion despite a green summary',()=>{const f=fixture();f.value.tests.testResults[0].assertionResults[0].status='failed';fs.writeFileSync(path.join(f.root,'vitest.json'),JSON.stringify(f.value.tests));expect(()=>collect(f)).toThrow('RELEASE_REPORT_FILES_REJECTED');});
it('refuses modified JUnit assertion even with unchanged counts',()=>{const f=fixture();fs.writeFileSync(path.join(f.root,'junit.xml'),f.value.junit.replace('name="second assertion"','name="foreign assertion"'));expect(()=>collect(f)).toThrow('RELEASE_REPORT_FILES_REJECTED');});
it('requires independently supplied suite inventory rather than report-declared critical suites',()=>{const f=fixture();f.value.expected.requiredSuites.push('server/critical.test.ts');expect(()=>collect(f)).toThrow('RELEASE_REPORT_FILES_REJECTED');});
