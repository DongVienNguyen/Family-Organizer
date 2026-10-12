import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
// The authenticated elevated native wrapper owns the installation guard and ACLs.
// This helper handles public state only; it never accepts a key or recovery input.
const phases=['planned','snapshot','switching','held','opening','committed','failed','rollback-snapshot','restored','reopening-old','rolled-back','rollback-binary','binary-rolled-back'];
const terminal=['committed','rolled-back','binary-rolled-back'];
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===expected.slice().sort().join(',');
const absolute=value=>typeof value==='string'&&value.length<=4096&&path.isAbsolute(value)&&path.resolve(value)===value&&!value.includes('\0');
const digest=value=>createHash('sha256').update(value).digest('hex');
function refuse(code='UPDATE_JOURNAL_INVALID'){throw new Error(code);}
function inside(parent,child){const relative=path.relative(parent,child);return relative===''||(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));}
function ordinary(file){for(let current=path.resolve(file);;current=path.dirname(current)){const stat=fs.lstatSync(current,{throwIfNoEntry:false});if(stat?.isSymbolicLink())refuse();if(path.dirname(current)===current)break;}}
function validateAttempt(value){
 if(!keys(value,['operationId','serviceId','instanceRoot','oldRelease','candidateRelease'])||!uuid(value.operationId)||typeof value.serviceId!=='string'||!/^FamilyOrganizer(?:-[A-Za-z0-9]{1,48})?$/.test(value.serviceId)||!absolute(value.instanceRoot))refuse();
 for(const release of [value.oldRelease,value.candidateRelease])if(!keys(release,['root','manifestSha256'])||!absolute(release.root)||!hash(release.manifestSha256))refuse();
 const roots=[value.instanceRoot,value.oldRelease.root,value.candidateRelease.root];for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(inside(roots[i],roots[j])||inside(roots[j],roots[i]))refuse();
}
function validateRecord(value){
 if(!object(value))refuse();const {phase,writesMayOpen,snapshot,rollbackOperationId,...attempt}=value;validateAttempt(attempt);
 if(rollbackOperationId!==undefined&&(rollbackOperationId===value.operationId||!uuid(rollbackOperationId)||!['rollback-binary','binary-rolled-back'].includes(phase)))refuse();
 if(['rollback-binary','binary-rolled-back'].includes(phase)&&!uuid(rollbackOperationId))refuse();
 if(!phases.includes(phase)||typeof writesMayOpen!=='boolean')refuse();
 if(snapshot!==undefined&&(!keys(snapshot,['file','sha256','bytes'])||!absolute(snapshot.file)||!hash(snapshot.sha256)||!Number.isSafeInteger(snapshot.bytes)||snapshot.bytes<=48||snapshot.bytes>256*1024*1024+48||!snapshot.file.endsWith('.fo-recovery')))refuse();
 if(!['planned','failed'].includes(phase)&&snapshot===undefined)refuse();
 if(['opening','committed','reopening-old','rolled-back','binary-rolled-back'].includes(phase)&&writesMayOpen!==true)refuse();
 if(['planned','snapshot','switching','held','rollback-snapshot','restored'].includes(phase)&&writesMayOpen!==false)refuse();
}
function validateJournal(value,instance){
 if(!keys(value,['format','current','history'])||value.format!==1||!Array.isArray(value.history)||value.history.length>32)refuse();
 const ids=new Set();for(const record of [...value.history,value.current]){validateRecord(record);if(record.instanceRoot!==instance||ids.has(record.operationId))refuse();ids.add(record.operationId);if(record.rollbackOperationId!==undefined){if(ids.has(record.rollbackOperationId))refuse();ids.add(record.rollbackOperationId);}}
 if(value.history.some(row=>!terminal.includes(row.phase)||row.serviceId!==value.current.serviceId))refuse();
}
export function assertUpdateRoots(instance,oldRelease,candidateRelease){
 const roots=[instance,oldRelease,candidateRelease];for(const root of roots){if(!absolute(root))refuse('UPDATE_ROOTS_INVALID');ordinary(root);const actual=fs.realpathSync.native(root),same=process.platform==='win32'?actual.toLowerCase()===root.toLowerCase():actual===root;if(!same||!fs.statSync(root).isDirectory())refuse('UPDATE_ROOTS_INVALID');}for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(inside(roots[i],roots[j])||inside(roots[j],roots[i]))refuse('UPDATE_ROOTS_INVALID');return {rootsVerified:true};
}
function readPublicJson(file,limit){
 let fd,bytes;
 try{
  ordinary(file);const ancestors=[];for(let current=path.dirname(file);;current=path.dirname(current)){const stat=fs.lstatSync(current);if(!stat.isDirectory())refuse();ancestors.push({file:current,dev:stat.dev,ino:stat.ino});if(path.dirname(current)===current)break;}const prior=fs.lstatSync(file);if(!prior.isFile()||prior.nlink!==1||prior.size>limit)refuse();
  fd=fs.openSync(file,'r');const initial=fs.fstatSync(fd);if(initial.dev!==prior.dev||initial.ino!==prior.ino||initial.size!==prior.size||initial.nlink!==1)refuse();
  bytes=Buffer.alloc(initial.size);let offset=0;while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!count)refuse();offset+=count;}
  if(fs.readSync(fd,Buffer.alloc(1),0,1,null))refuse();const after=fs.fstatSync(fd);ordinary(file);for(const ancestor of ancestors){const stat=fs.lstatSync(ancestor.file);if(!stat.isDirectory()||stat.dev!==ancestor.dev||stat.ino!==ancestor.ino)refuse();}const fixed=fs.lstatSync(file);if(after.nlink!==1||after.size!==initial.size||after.mtimeMs!==initial.mtimeMs||after.ctimeMs!==initial.ctimeMs||fixed.dev!==initial.dev||fixed.ino!==initial.ino||fixed.nlink!==1||fixed.mtimeMs!==initial.mtimeMs||fixed.ctimeMs!==initial.ctimeMs||fixed.size!==initial.size)refuse();
  return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:digest(bytes)};
 }catch{refuse();}finally{bytes?.fill(0);if(fd!==undefined)fs.closeSync(fd);}
}
export function readJournal(instance){const result=readPublicJson(path.join(instance,'service/update-journal.json'),131072);validateJournal(result.value,instance);return {journal:result.value,sha256:result.sha256};}
export function assertUpdateBoundary(journal,owner,control,storage,mode){
 try{
  if(!object(journal)||!object(owner)||!object(storage)||!['terminal','rollback'].includes(mode))refuse();validateJournal(journal,owner.instanceRoot);const row=journal.current;
  if(!keys(control,['format','operationId','manifestSha256','phase'])||control.format!==1||!uuid(control.operationId)||!hash(control.manifestSha256)||!['held','approve'].includes(control.phase)||owner.format!==1||owner.serviceId!==row.serviceId||owner.instanceRoot!==row.instanceRoot||typeof storage.writesMayHaveOpened!=='boolean'||typeof storage.openedBindingVerified!=='boolean')refuse();
  const old=mode==='terminal'&&['rolled-back','binary-rolled-back'].includes(row.phase),release=old?row.oldRelease:row.candidateRelease,id=old&&row.phase==='binary-rolled-back'?row.rollbackOperationId:row.operationId;
  if(owner.releaseRoot!==release.root||owner.manifestHash!==release.manifestSha256||control.operationId!==id||control.manifestSha256!==release.manifestSha256||storage.boundManifestSha256!==release.manifestSha256)refuse();
  if(mode==='terminal'){if(!terminal.includes(row.phase)||row.writesMayOpen!==true||control.phase!=='approve'||!storage.writesMayHaveOpened||!storage.openedBindingVerified)refuse();}
  else{
   if(!['held','failed','opening','committed'].includes(row.phase))refuse();
   if(!row.writesMayOpen){if(control.phase!=='held'||storage.writesMayHaveOpened)refuse();}
   else if(row.phase==='committed'){if(control.phase!=='approve'||!storage.openedBindingVerified)refuse();}
   else if(control.phase==='held'){if(storage.writesMayHaveOpened)refuse();}
   else if(storage.writesMayHaveOpened&&!storage.openedBindingVerified)refuse();
  }
  return {boundaryVerified:true};
 }catch{refuse('UPDATE_BOUNDARY_INVALID');}
}
function readUpdateBoundary(instance,packet){
 if(!keys(packet,['owner','storage','mode','expectedSha256'])||!hash(packet.expectedSha256))refuse('UPDATE_BOUNDARY_INVALID');
 const current=readJournal(instance);if(current.sha256!==packet.expectedSha256)refuse('UPDATE_JOURNAL_CHANGED');
 let control;try{control=readPublicJson(path.join(instance,'config/update-control.json'),8192).value;}catch{refuse('UPDATE_BOUNDARY_INVALID');}
 return assertUpdateBoundary(current.journal,packet.owner,control,packet.storage,packet.mode);
}

function persist(instance,journal,expected){
 validateJournal(journal,instance);const file=path.join(instance,'service/update-journal.json'),directory=path.dirname(file);ordinary(directory);if(!fs.statSync(directory).isDirectory())refuse();
 const bytes=Buffer.from(JSON.stringify(journal)+'\n');if(bytes.length>131072)refuse();const stage=file+'.stage-'+randomUUID();let fd,created=false;
 try{
  fd=fs.openSync(stage,'wx',0o600);created=true;fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  if(expected===undefined){if(fs.lstatSync(file,{throwIfNoEntry:false}))refuse('UPDATE_JOURNAL_CHANGED');fs.linkSync(stage,file);fs.unlinkSync(stage);created=false;}
  else {if(readJournal(instance).sha256!==expected)refuse('UPDATE_JOURNAL_CHANGED');fs.renameSync(stage,file);created=false;}
  const result=readJournal(instance);if(!isDeepStrictEqual(result.journal,journal))refuse();return result;
 }finally{bytes.fill(0);if(fd!==undefined)fs.closeSync(fd);if(created)fs.rmSync(stage,{force:true});}
}
export function initializeJournal(instance,attempt){
 validateAttempt(attempt);if(attempt.instanceRoot!==instance)refuse();const file=path.join(instance,'service/update-journal.json');ordinary(file);let previous;
 if(fs.lstatSync(file,{throwIfNoEntry:false})){previous=readJournal(instance);if(!terminal.includes(previous.journal.current.phase))refuse('UPDATE_JOURNAL_ACTIVE');if(previous.journal.history.length>=32||[...previous.journal.history,previous.journal.current].some(row=>row.operationId===attempt.operationId))refuse('UPDATE_JOURNAL_ACTIVE');}
 return persist(instance,{format:1,current:{...attempt,phase:'planned',writesMayOpen:false},history:previous?[...previous.journal.history,previous.journal.current]:[]},previous?.sha256);
}
export function transitionJournal(instance,expected,event){
 const current=readJournal(instance);if(!hash(expected)||current.sha256!==expected)refuse('UPDATE_JOURNAL_CHANGED');
 if(!object(event)||!keys(event,event.phase==='snapshot'?['phase','snapshot']:event.phase==='rollback-binary'?['phase','rollbackOperationId']:['phase']))refuse('UPDATE_JOURNAL_TRANSITION');
 const row=current.journal.current,next=event.phase;
 if(next==='rollback-snapshot'&&row.writesMayOpen)refuse('UPDATE_WRITES_MAY_HAVE_OPENED');
 const edges={planned:['snapshot','failed'],snapshot:['switching','failed'],switching:['held','failed'],held:['opening','failed','rollback-snapshot','rollback-binary'],opening:['committed','failed','rollback-binary'],committed:['rollback-binary'],failed:['rollback-snapshot','rollback-binary'], 'rollback-snapshot':['restored'],restored:['reopening-old'],'reopening-old':['rolled-back'],'rollback-binary':['binary-rolled-back']};
 if(!edges[row.phase]?.includes(next)||(next==='rollback-snapshot'&&!row.snapshot))refuse('UPDATE_JOURNAL_TRANSITION');
 const record={...row,phase:next,writesMayOpen:row.writesMayOpen||['opening','reopening-old','rollback-binary','binary-rolled-back'].includes(next),...(next==='snapshot'?{snapshot:event.snapshot}:{}),...(next==='rollback-binary'?{rollbackOperationId:event.rollbackOperationId}:{})};
 return persist(instance,{...current.journal,current:record},expected);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [instance,action,expected]=process.argv.slice(2);if(!absolute(instance)||!['read','roots','boundary','initialize','transition'].includes(action)||process.argv.length!==(action==='transition'?5:4))refuse();
  let value;if(action!=='read'){const chunks=[];let total=0;for await(const chunk of process.stdin){total+=chunk.length;if(total>16384)refuse();chunks.push(chunk);}value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  const result=action==='boundary'?readUpdateBoundary(instance,value):action==='roots'?assertUpdateRoots(instance,value.oldReleaseRoot,value.candidateReleaseRoot):action==='read'?readJournal(instance):action==='initialize'?initializeJournal(instance,value):transitionJournal(instance,expected,value);process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){process.stdout.write(JSON.stringify({error:/^UPDATE_[A-Z_]+$/.test(error?.message)?error.message:'UPDATE_JOURNAL_INVALID'})+'\n');process.exitCode=1;}
}
