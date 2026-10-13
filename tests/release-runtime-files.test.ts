import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {releaseRuntimeFixture} from './helpers/release-runtime-fixture';
import * as runtime from '../scripts/windows/release-runtime-reports.mjs';
const roots:string[]=[];
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'release runtime raw files '));roots.push(root);const value=releaseRuntimeFixture();const save=()=>{for(const [name,data]of Object.entries({'native.json':value.native,'production.json':value.production,'audit.json':value.audit,'audit-context.json':value.auditContext,'evidence.json':value.evidence}))fs.writeFileSync(path.join(root,name),JSON.stringify(data));};save();return {root,value,save};}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const read=(f:ReturnType<typeof fixture>)=>(runtime as any).readReleaseRuntimeFiles(f.root,f.value.expected);
it('collects actual pinned runtime/production/audit files while remaining report families are unverified',()=>expect(read(fixture())).toMatchObject({runtimeProductionAuditVerified:true,reportsVerified:false,publicationAllowed:false}));
it.each(['native.json','production.json','audit.json','audit-context.json','evidence.json'])('refuses omitted actual runtime/audit report %s',name=>{const f=fixture();fs.unlinkSync(path.join(f.root,name));expect(()=>read(f)).toThrow('RELEASE_RUNTIME_FILES_REJECTED');});
it('refuses mismatched raw runtime file and quality receipt',()=>{const f=fixture();f.value.native.binarySha256='f'.repeat(64);f.save();expect(()=>read(f)).toThrow('RELEASE_RUNTIME_FILES_REJECTED');});
it('refuses remaining audit vulnerability despite a matching receipt',()=>{const f=fixture();f.value.audit.vulnerabilities.synthetic={severity:'high'};f.value.evidence.audit=structuredClone(f.value.audit);f.save();expect(()=>read(f)).toThrow('RELEASE_RUNTIME_FILES_REJECTED');});
