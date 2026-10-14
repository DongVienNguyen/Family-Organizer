import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as gateway from '../appStore.js';
import * as sqlite from '../sqlite.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {FamilyDB} from '../db.js';
import {UserRole} from '../../src/types.js';
import {createTaskCommands} from './tasks.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {loadTask} from './store.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'productivity:commands-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let initialized=false;
function setup(){
 if(initialized)return;
 fixture(tx=>{tx.legacy.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic-offline',avatarColor:'bg-blue-500',createdAt:'2026-10-10T00:00:00Z'}));tx.legacy.tasks=[legacyTask('existing',{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD})];});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;
}
const connection=sqlite.sqliteConnection();
const commands=createTaskCommands({write:gateway.withAppWriteTransaction,reader:{get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)}});
const context=(role=UserRole.ADMIN,revision=1,requestId=randomUUID())=>({actor:{userId:role,role},requestId,expectedRevision:revision});
it('creates no-date/none task once through the owned gateway with server-owned identity and safe body',()=>{
 setup();const ctx=context(UserRole.CHILD,0);const input={listId:'legacy-family',title:'Synthetic new task',body:'<script>synthetic()</script> [x](javascript:synthetic())',due:{kind:'none' as const},priority:'none' as const};
 const first=commands.createTask(ctx,input),retry=commands.createTask(ctx,input);expect(retry).toEqual(first);
 expect(first).toMatchObject({creatorId:UserRole.CHILD,rewardPoints:0,pendingApproval:false,lifecycle:'todo',revision:1,due:{kind:'none'},priority:'none'});
 expect(FamilyDB.getTasks().filter(t=>t.id===first.id)).toHaveLength(1);expect(FamilyDB.getUsers()).toHaveLength(4);
 const old=FamilyDB.getTasks().find(t=>t.id===first.id)!;FamilyDB.saveTask({id:old.id,title:'Legacy edit',priority:old.priority,baseUpdatedAt:old.updatedAt},UserRole.CHILD,'synthetic-child');
 expect(fixture(tx=>loadTask(tx,first.id))).toMatchObject({title:'Legacy edit',priority:'none',due:{kind:'none'}});
 expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({n:0});expect(FamilyDB.getRewardLedger()).toEqual([]);
});
it('updates whitelist fields atomically and keeps server audit/creator/structure/reward unchanged',()=>{
 setup();const before=fixture(tx=>loadTask(tx,'existing')!);const ctx=context(UserRole.CHILD,before.revision);
 const result=commands.updateTask(ctx,'existing',{title:'Semantic edit',body:'Synthetic Markdown **safe**',blocked:true,blockedReason:'Synthetic waiting'});
 expect(result.revision).toBe(before.revision+1);expect(result.creatorId).toBe(before.creatorId);expect(result.legacy.createdAt).toBe(before.legacy.createdAt);
 expect(result.legacy.comments).toEqual(before.legacy.comments);expect(result.rewardPoints).toBe(before.rewardPoints);expect(result.legacy.proofImage).toBe(before.legacy.proofImage);
 expect(result.legacy.history.at(-1)).toMatchObject({userId:UserRole.CHILD});expect(commands.updateTask(ctx,'existing',{title:'Semantic edit',body:'Synthetic Markdown **safe**',blocked:true,blockedReason:'Synthetic waiting'})).toEqual(result);
});
it.each(['creatorId','createdAt','rewardPoints','pendingApproval','comments','lifecycle','isShared','listId'])('rejects forged patch %s without mutation or command claim',field=>{
 setup();const before=fixture(tx=>loadTask(tx,'existing')!);const count=sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get();
 expect(()=>commands.updateTask(context(UserRole.CHILD,before.revision),'existing',{[field]:'forged'} as any)).toThrow(expect.objectContaining({status:400}));
 expect(fixture(tx=>loadTask(tx,'existing')!)).toEqual(before);
 // The fixture read adds one independent command claim; the failed write adds none.
 expect(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM app_commands').get()).toEqual({n:(count as any).n+1});
});
it('rejects stale revisions and reused request ID with changed payload',()=>{
 setup();const row=fixture(tx=>loadTask(tx,'existing')!);const ctx=context(UserRole.CHILD,row.revision);commands.updateTask(ctx,'existing',{title:'Fresh'});
 expect(()=>commands.updateTask(context(UserRole.CHILD,row.revision),'existing',{title:'Stale'})).toThrow(expect.objectContaining({status:409}));
 expect(()=>commands.updateTask(ctx,'existing',{title:'Different'})).toThrow(expect.objectContaining({status:409}));
});
it('rejects nonexistent assignee, invalid interval, child reassignment of rewarded task and untrusted roles',()=>{
 setup();const row=fixture(tx=>loadTask(tx,'existing')!);
 expect(()=>commands.updateTask(context(UserRole.ADMIN,row.revision),'existing',{assigneeId:'missing'})).toThrow(expect.objectContaining({status:422}));
 expect(()=>commands.updateTask(context(UserRole.ADMIN,row.revision),'existing',{scheduledStart:'2026-10-15T00:00:00Z',scheduledEnd:'2026-10-14T00:00:00Z'})).toThrow(expect.objectContaining({status:422}));
 expect(()=>commands.updateTask(context(UserRole.CHILD,row.revision),'existing',{assigneeId:UserRole.MEMBER})).toThrow(expect.objectContaining({status:403}));
 expect(()=>commands.createTask(context(UserRole.GUEST,0),{listId:'legacy-family',title:'Denied'})).toThrow(expect.objectContaining({status:403}));
 expect(()=>commands.createTask({...context(UserRole.ADMIN,0),actor:{userId:UserRole.CHILD,role:UserRole.ADMIN}},{listId:'legacy-family',title:'Forged role'})).toThrow(expect.objectContaining({status:403}));
});
it('revoked grant or role blocks replay of a previously committed command',()=>{
 setup();fixture(tx=>{tx.run('INSERT OR REPLACE INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'write');});
 const own=commands.createTask(context(UserRole.ADMIN,0),{listId:'legacy-family',title:'Synthetic granted private',isShared:false});
 const ctx=context(UserRole.MEMBER,own.revision),patch={title:'Granted edit'};commands.updateTask(ctx,own.id,patch);
 fixture(tx=>tx.run('DELETE FROM productivity_list_grants WHERE user_id=?',UserRole.MEMBER));
 expect(()=>commands.updateTask(ctx,own.id,patch)).toThrow(expect.objectContaining({status:404}));
 fixture(tx=>{const user=tx.legacy.users.find(u=>u.id===UserRole.MEMBER)!;user.isDeleted=true;});
 expect(()=>commands.updateTask(ctx,own.id,patch)).toThrow(expect.objectContaining({status:403}));
 fixture(tx=>{tx.legacy.users.find(u=>u.id===UserRole.MEMBER)!.isDeleted=false;});
});
it('common snapshot preserves new no-date/none task and original metadata with no reward replay',async()=>{
 setup();const created=commands.createTask(context(UserRole.CHILD,0),{listId:'legacy-family',title:'Synthetic snapshot task'});
 const saved=fixture(tx=>snapshot.collectAppSnapshot(tx));commands.updateTask(context(UserRole.CHILD,created.revision),created.id,{title:'Changed after snapshot'});
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});
 expect(fixture(tx=>loadTask(tx,created.id))).toEqual(created);expect(FamilyDB.getRewardLedger()).toEqual([]);expect(FamilyDB.getTasks().find(t=>t.id===created.id)?.title).toBe(created.title);
});
it.each([['listId',[]],['listId',42],['title',{}]])('returns a typed validation error for invalid create field %s', (field,value)=>{
 setup();expect(()=>commands.createTask(context(UserRole.ADMIN,0),{listId:'legacy-family',title:'Synthetic invalid',[field]:value} as any)).toThrow(expect.objectContaining({status:422}));
});
