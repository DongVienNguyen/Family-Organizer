import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {FamilyDB} from '../db.js';
import {UserRole} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {loadTask,savePilotTask} from './store.js';
import {spawnSync} from 'node:child_process';
import {checksum} from '../snapshotValidation.js';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:bridge-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let initialized=false;
function setup(){
 if(initialized)return;
 command(tx=>{tx.legacy.users=[{id:'adult',username:'synthetic-admin',fullName:'Synthetic admin',role:UserRole.ADMIN,avatarColor:'bg-blue-500',passwordHash:'synthetic-offline-hash',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=[legacyTask('parent'),legacyTask('child')];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});initialized=true;
}
it('legacy title write preserves canonical structure/pin/audit after atomic single-source cutover',()=>{
 setup();const digest=command(tx=>legacyTaskDigest(tx.legacy.tasks));
 command(tx=>{const child=loadTask(tx,'child')!;tx.run('INSERT INTO productivity_sections(id,list_id,title) VALUES(?,?,?)','section',child.listId,'Synthetic');child.sectionId='section';child.parentId='parent';savePilotTask(tx,child);tx.run('INSERT INTO productivity_matrix_pins(view_id,task_id,quadrant) VALUES(?,?,?)','view','child','q2');expect(activateCanonicalTasks(tx,digest).tasks).toBe(2);});
 const old=FamilyDB.getTasks().find(t=>t.id==='child')!;FamilyDB.saveTask({id:old.id,title:'Real legacy edit',baseUpdatedAt:old.updatedAt},'adult','synthetic-admin');
 command(tx=>{const row=loadTask(tx,'child')!;expect(row.title).toBe('Real legacy edit');expect(row.parentId).toBe('parent');expect(row.sectionId).toBe('section');expect(row.legacy.comments[0].content).toBe('Keep comment');expect(tx.get('SELECT quadrant FROM productivity_matrix_pins WHERE task_id=?','child').quadrant).toBe('q2');expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});
it('unrelated dirty writes never repopulate raw task rows or lose canonical data; active direct saves are refused',()=>{
 setup();command(tx=>{tx.legacy.notes.push({id:'synthetic-note',title:'Note',content:'Synthetic',creatorId:'adult',isShared:true,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'} as any);});
 const raw=sqlite.sqliteLoad();raw.tasks[0].title='Bypass';expect(()=>sqlite.sqliteSave(raw)).toThrow(/gateway/i);expect(FamilyDB.getTasks().some(t=>t.title==='Bypass')).toBe(false);
 command(tx=>{expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);expect(loadTask(tx,'child')!.title).toBe('Real legacy edit');});
});
it('a failed legacy command rolls back canonical title, revision and other dirty collections',()=>{
 setup();const before=command(tx=>loadTask(tx,'child')!);
 expect(()=>command(tx=>{FamilyDB.saveTask({id:'child',title:'Rollback'},'adult','synthetic-admin');tx.legacy.notes=[];throw new Error('synthetic fence');})).toThrow('synthetic fence');
 command(tx=>{expect(loadTask(tx,'child')!.revision).toBe(before.revision);expect(loadTask(tx,'child')!.title).toBe(before.title);expect(tx.legacy.notes.some(n=>n.id==='synthetic-note')).toBe(true);});
});
it('common snapshot restores canonical projection, active marker and metadata without a raw duplicate writer',async()=>{
 setup();const saved=command(tx=>snapshot.collectAppSnapshot(tx));FamilyDB.saveTask({id:'child',title:'After snapshot'},'adult','synthetic-admin');
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});
 expect(FamilyDB.getTasks().find(t=>t.id==='child')!.title).toBe('Real legacy edit');command(tx=>{expect(tx.get("SELECT value FROM app_meta WHERE key='productivity_active'").value).toBe('1');expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});
it('rejects a recomputed active snapshot with legacy projection diverging from canonical rows',()=>{
 setup();const good=command(tx=>snapshot.collectAppSnapshot(tx));const bad=structuredClone(good);bad.legacy.tasks[0].title='Forged mirror';bad.manifest.checksum=checksum(bad);expect(()=>snapshot.validateAppSnapshot(bad)).toThrow();
});
it('rejects an unsupported active marker before restoring files or data',()=>{
 setup();const good=command(tx=>snapshot.collectAppSnapshot(tx));const bad=structuredClone(good);bad.tables.app_meta.find(row=>row.key==='productivity_active')!.value='2';bad.manifest.checksum=checksum(bad);expect(()=>snapshot.validateAppSnapshot(bad)).toThrow();
});
it('legacy delete hides the task but preserves its canonical tombstone/provenance for snapshots',()=>{
 setup();FamilyDB.deleteTask('child','adult','synthetic-admin');expect(FamilyDB.getTasks().some(t=>t.id==='child')).toBe(false);
 command(tx=>{const row=loadTask(tx,'child')!;expect(row.deletedAt).not.toBeNull();expect(row.legacy.proofNote).toBe('Synthetic proof');expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});
it('a fresh process reconstructs canonical legacy projection from persisted data without a second writer',()=>{
 setup();
 const url=(file:string)=>new URL(file,import.meta.url).href;
 const code=`const sqlite=await import(${JSON.stringify(url('../sqlite.ts'))});const gateway=await import(${JSON.stringify(url('../appStore.ts'))});const migrations=await import(${JSON.stringify(url('../appMigrations.ts'))});const snapshot=await import(${JSON.stringify(url('../appSnapshot.ts'))});const bridge=await import(${JSON.stringify(url('./adapter.ts'))});bridge.configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});console.log(JSON.stringify({ids:sqlite.sqliteLoad().tasks.map(row=>row.id),rawCount:sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM tasks').get().n}));sqlite.sqliteClose();`;
 const env=Object.fromEntries(['PATH','SystemRoot','SYSTEMROOT','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]!]));
 const loader=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
 const result=spawnSync(process.execPath,['--import',loader,'--input-type=module','-e',code],{env:{...env,DATA_DIR:process.env.DATA_DIR!,NODE_ENV:'test'},encoding:'utf8',timeout:15000});
 expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout.trim())).toEqual({ids:['parent'],rawCount:0});
});
