import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {FamilyDB,setAppSetting} from '../db.js';
import {withAppCommandContext} from '../commandContext.js';
import {UserRole,TaskStatus} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {loadTask} from './store.js';
const command=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:characterization',command:'productivity:legacy-characterization',requestId:randomUUID(),payloadHash:'synthetic'},fn);
let active=false;
function setup(){
 if(active)return;
 command(tx=>{tx.legacy.users=Object.values(UserRole).map(role=>({id:role,username:'synthetic-'+role,fullName:'Synthetic '+role,role,passwordHash:'synthetic-offline-hash',avatarColor:'bg-blue-500',createdAt:'2026-10-11T00:00:00Z'}));tx.legacy.tasks=[legacyTask('approval',{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,rewardPoints:20,recurrenceType:'yearly',rotationMemberIds:[UserRole.CHILD,UserRole.MEMBER],sourceRecurringTaskId:null}),legacyTask('reject',{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,rewardPoints:7,sourceRecurringTaskId:null}),legacyTask('rollback',{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,rewardPoints:9,sourceRecurringTaskId:null})];tx.legacy.rewardLedger=[];tx.legacy.notifications=[];});
 setAppSetting('rewardApprovalThreshold','0');configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});command(tx=>{activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks));});active=true;
}
it('active Child submit/adult approve grants once and preserves annual recurrence, rotation and proof metadata',()=>{
 setup();const submitted=FamilyDB.saveTask({id:'approval',status:TaskStatus.COMPLETED,proofNote:'Synthetic Child submission'},UserRole.CHILD,'synthetic-child');expect(submitted).toMatchObject({status:TaskStatus.IN_PROGRESS,pendingApproval:true,submittedById:UserRole.CHILD});expect(FamilyDB.getRewardLedger()).toEqual([]);
 command(tx=>{const row=loadTask(tx,'approval')!;expect(row.lifecycle).toBe('in_progress');expect(row.pendingApproval).toBe(true);expect(row.legacy.comments[0].content).toBe('Keep comment');expect(row.legacy.proofNote).toBe('Synthetic Child submission');expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
 expect(()=>FamilyDB.approveTaskCompletion('approval',UserRole.GUEST,'synthetic-guest')).toThrow(expect.objectContaining({status:403}));expect(FamilyDB.getRewardLedger()).toEqual([]);
 const approved=FamilyDB.approveTaskCompletion('approval',UserRole.MEMBER,'synthetic-member');expect(approved.status).toBe(TaskStatus.COMPLETED);expect(FamilyDB.getRewardLedger().filter(row=>row.taskId==='approval').map(row=>row.points)).toEqual([20]);
 const next=FamilyDB.getTasks().filter(row=>row.sourceRecurringTaskId==='approval');expect(next).toHaveLength(1);expect(next[0]).toMatchObject({status:TaskStatus.TODO,assigneeId:UserRole.MEMBER,dueDate:'2027-10-11 09:30',recurrenceType:'yearly',pendingApproval:false,proofImage:null,proofNote:null,comments:[]});
 FamilyDB.saveTask({id:'approval',status:TaskStatus.COMPLETED},UserRole.MEMBER,'synthetic-member');expect(FamilyDB.getTasks().filter(row=>row.sourceRecurringTaskId==='approval')).toHaveLength(1);expect(FamilyDB.getRewardLedger().filter(row=>row.taskId==='approval')).toHaveLength(1);
 command(tx=>{expect(loadTask(tx,'approval')!.lifecycle).toBe('completed');expect(loadTask(tx,next[0].id)!.assigneeId).toBe(UserRole.MEMBER);expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});
it('active rejection retains proof/audit without points and forged reward patch rolls back',()=>{
 setup();FamilyDB.saveTask({id:'reject',status:TaskStatus.COMPLETED,proofNote:'Synthetic rejected submission'},UserRole.CHILD,'synthetic-child');const before=command(tx=>loadTask(tx,'reject')!);
 expect(()=>FamilyDB.saveTask({id:'reject',rewardPoints:999},UserRole.CHILD,'synthetic-child')).toThrow(expect.objectContaining({status:403}));command(tx=>{expect(loadTask(tx,'reject')).toEqual(before);});
 const rejected=FamilyDB.rejectTaskCompletion('reject',UserRole.ADMIN,'synthetic-admin','Synthetic retry reason');expect(rejected).toMatchObject({pendingApproval:false,rejectionReason:'Synthetic retry reason',proofNote:'Synthetic rejected submission'});expect(FamilyDB.getRewardLedger().filter(row=>row.taskId==='reject')).toEqual([]);
 command(tx=>{expect(loadTask(tx,'reject')!.legacy.history.length).toBeGreaterThan(0);expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);});
});
it('active approval and reward roll back together, while retried request identity does not grant twice',()=>{
 setup();FamilyDB.saveTask({id:'rollback',status:TaskStatus.COMPLETED},UserRole.CHILD,'synthetic-child');const before=command(tx=>loadTask(tx,'rollback')!);
 expect(()=>command(()=>{FamilyDB.approveTaskCompletion('rollback',UserRole.ADMIN,'synthetic-admin');throw Error('synthetic approval fence');})).toThrow('synthetic approval fence');command(tx=>{expect(loadTask(tx,'rollback')).toEqual(before);});expect(FamilyDB.getRewardLedger().filter(row=>row.taskId==='rollback')).toEqual([]);
 const context={actorId:UserRole.ADMIN,requestId:randomUUID()};const first=withAppCommandContext(context,()=>FamilyDB.approveTaskCompletion('rollback',UserRole.ADMIN,'synthetic-admin'));const retry=withAppCommandContext(context,()=>FamilyDB.approveTaskCompletion('rollback',UserRole.ADMIN,'synthetic-admin'));expect(retry).toEqual(first);expect(FamilyDB.getRewardLedger().filter(row=>row.taskId==='rollback').map(row=>row.points)).toEqual([9]);
});
it('shared snapshot roundtrip retains active approval, recurrence IDs, provenance and points without replay',async()=>{
 setup();const tasks=FamilyDB.getTasks(),ledger=FamilyDB.getRewardLedger(),saved=command(tx=>snapshot.collectAppSnapshot(tx));FamilyDB.saveTask({id:'approval',title:'After synthetic snapshot'},UserRole.ADMIN,'synthetic-admin');
 await snapshot.restoreAppSnapshot(snapshot.validateAppSnapshot(saved),{maintenance:async fn=>fn()});expect(FamilyDB.getTasks()).toEqual(tasks);expect(FamilyDB.getRewardLedger()).toEqual(ledger);command(tx=>{expect(tx.get('SELECT count(*) AS n FROM tasks').n).toBe(0);expect(tx.all('SELECT id FROM productivity_tasks').length).toBe(4);});
});
