import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createStructureCommands} from './structure.js';
import {createTaskCommands} from './tasks.js';
import {beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {FamilyDB,setAppSetting} from '../db.js';
import {TaskStatus,UserRole} from '../../src/types.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {createCompletionCommands} from './completion.js';
import {createTaskAccess} from './access.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
const write=<T>(work:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:completion-characterization',requestId:randomUUID(),payloadHash:'synthetic'},work);
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]},access=createTaskAccess(reader),commands=createCompletionCommands({reader,write:gateway.withAppWriteTransaction,legacy:FamilyDB});
const actor=(role=UserRole.CHILD)=>({userId:role,role}),current=(id:string)=>access.getTask(actor(UserRole.ADMIN),id)!,ctx=(id:string,role=UserRole.CHILD)=>({actor:actor(role),expectedRevision:current(id).revision,requestId:randomUUID()});
beforeAll(()=>{write(tx=>{tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline-only',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));tx.legacy.tasks=[];tx.legacy.rewardLedger=[];tx.legacy.notifications=[];});setAppSetting('rewardApprovalThreshold','5');configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));});
function fixture(points=10,recurring=false){const id=randomUUID();write(tx=>tx.legacy.tasks.unshift(legacyTask(id,{creatorId:UserRole.ADMIN,assigneeId:UserRole.CHILD,rewardPoints:points,recurrenceType:recurring?'weekly':'none',rotationMemberIds:recurring?[UserRole.CHILD,UserRole.MEMBER]:[],sourceRecurringTaskId:null,proofImage:null,proofNote:null})));return id;}
const earned=(id:string)=>FamilyDB.getRewardLedger().filter(r=>r.taskId===id);
const reopen=(id:string,request=ctx(id,UserRole.ADMIN))=>commands.reopenTask(request,id);
function boardFixture(){registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});registerBoardViewMigration(migrations.registerDomainMigration);migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),list=structure.saveList({actor:actor(UserRole.ADMIN),expectedRevision:0,requestId:randomUUID()},{title:'Synthetic reopen WIP list',isShared:true}),ids=[0,1].map(()=>tasks.createTask({actor:actor(UserRole.ADMIN),expectedRevision:0,requestId:randomUUID()},{listId:list.id,title:'Synthetic reopen active capacity',assigneeId:UserRole.CHILD,isShared:true}).id);for(const id of ids){FamilyDB.saveTask({id,rewardPoints:5},UserRole.ADMIN,'synthetic-admin');commands.requestCompletion(ctx(id,UserRole.ADMIN),id,{});}const board=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}).configure({actor:actor(UserRole.ADMIN),expectedRevision:0,requestId:randomUUID()},{listId:list.id,mode:'sections',policies:[{columnKey:'none',policy:'hard',limit:1}]});return {ids,board};}
it('reopen reserves canonical WIP capacity and preserves the other completed claim when the final slot is full',()=>{const f=boardFixture(),[a,b]=f.ids;reopen(a);const tables=['productivity_tasks','productivity_board_positions','productivity_boards','app_reward_claims','reward_ledger','app_commands'],before=Object.fromEntries(tables.map(n=>[n,reader.all('SELECT * FROM '+n)]));expect(()=>reopen(b)).toThrow(expect.objectContaining({status:422}));for(const n of tables)expect(reader.all('SELECT * FROM '+n),n).toEqual(before[n]);expect(earned(a).map(e=>e.points)).toEqual([-5,5]);expect(earned(b).map(e=>e.points)).toEqual([5]);});
it('the same committed reopen UUID acknowledges its slot without reversing another time',()=>{const {ids:[a]}=boardFixture(),request=ctx(a,UserRole.ADMIN),first=reopen(a,request);expect(reopen(a,request)).toEqual(first);expect(earned(a).map(e=>e.points)).toEqual([-5,5]);});
it('a successful new completion releases the slot and allows exactly one later reopen',()=>{const {ids:[a,b]}=boardFixture();reopen(a);commands.requestCompletion(ctx(a,UserRole.ADMIN),a,{});expect(reopen(b).task.lifecycle).toBe('todo');expect(earned(a).map(e=>e.points)).toEqual([5,-5,5]);expect(earned(b).map(e=>e.points)).toEqual([-5,5]);});
