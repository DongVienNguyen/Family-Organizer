import {beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createTaskViews} from './views.js';
import {withBoardWipOverride} from './boardWipOverride.js';
import {loadTask,savePilotTask} from './store.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:board-view',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const ctx=(revision=0,role=UserRole.ADMIN)=>({actor:{userId:role,role},expectedRevision:revision,requestId:randomUUID()});
const views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),catalog=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}),structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
beforeAll(()=>{write(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});registerBoardViewMigration(migrations.registerDomainMigration);migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});});
const viewInput=(boardId?:string)=>({title:'Synthetic Kanban',kind:'kanban' as const,filter:{rootsOnly:true},config:{kind:'kanban' as const,mode:'sections' as const,group:'none' as const,sort:'rank' as const,columns:[],...(boardId===undefined?{}:{boardId})}});

function fixture(mode:'sections'|'workflow'='sections',shared=true){const list=structure.saveList(ctx(),{title:'Synthetic projected list',isShared:shared}),a=tasks.createTask(ctx(),{listId:list.id,title:'Synthetic visible root',isShared:true}),privateTask=tasks.createTask(ctx(),{listId:list.id,title:'Synthetic hidden root',isShared:false}),board=catalog.configure(ctx(),{listId:list.id,mode,policies:[{columnKey:mode==='sections'?'none':'todo',policy:'hard',limit:3}]}),save=(role=UserRole.ADMIN,filter:any={rootsOnly:true})=>views.saveView(ctx(0,role),{...viewInput(board.id),filter,config:{...viewInput(board.id).config,mode}});return {list,a,privateTask,board,save};}

function occupied(){const f=fixture(),section=structure.saveSection(ctx(),{listId:f.list.id,title:'Synthetic overflow source'});catalog.configure(ctx(f.board.revision),{listId:f.list.id,mode:'sections',policies:[{columnKey:'none',policy:'hard',limit:1}]});structure.moveTaskToList(ctx(f.privateTask.revision),f.privateTask.id,f.list.id,section.id);const column=reader.get("SELECT id FROM productivity_board_columns WHERE board_id=? AND column_key='none'",f.board.id);return {...f,column,scope:{taskId:f.privateTask.id,boardId:f.board.id,columnId:column.id,reason:'Synthetic explicit admin capacity exception'}};}
const enter=(tx:any,id:string,actor=ctx().actor)=>{const before=loadTask(tx,id)!;savePilotTask(tx,{...before,sectionId:null},actor);};
it('generic admin actor remains unable to bypass a full hard column',()=>{const f=occupied();expect(()=>write(tx=>enter(tx,f.privateTask.id))).toThrow(expect.objectContaining({status:422}));});
it('explicit current-admin scope admits exactly its matching hard-limit entrant',()=>{const f=occupied();write(tx=>withBoardWipOverride(tx,ctx().actor,f.scope,()=>enter(tx,f.privateTask.id)));expect(reader.get('SELECT section_id FROM productivity_tasks WHERE id=?',f.privateTask.id).section_id).toBeNull();});
it.each([UserRole.MEMBER,UserRole.CHILD,UserRole.GUEST])('role %s never acquires a WIP override',role=>{const f=occupied();expect(()=>write(tx=>withBoardWipOverride(tx,ctx(0,role).actor,f.scope,()=>enter(tx,f.privateTask.id)))).toThrow(expect.objectContaining({status:403}));});
it('override reason and exact Task/board/column bindings cannot broaden admission',()=>{const f=occupied();for(const patch of [{reason:''},{reason:'x'.repeat(501)},{taskId:f.a.id},{boardId:'synthetic-other'},{columnId:'synthetic-other'}])expect(()=>write(tx=>withBoardWipOverride(tx,ctx().actor,{...f.scope,...patch},()=>enter(tx,f.privateTask.id)))).toThrow();});
it('a failed scoped write clears its permit and rolls back every position and Task row',()=>{const f=occupied(),before=reader.all('SELECT * FROM productivity_board_positions WHERE board_id=?',f.board.id);expect(()=>write(tx=>withBoardWipOverride(tx,ctx().actor,f.scope,()=>{enter(tx,f.privateTask.id);throw Error('synthetic after override');}))).toThrow('synthetic after override');expect(reader.all('SELECT * FROM productivity_board_positions WHERE board_id=?',f.board.id)).toEqual(before);expect(()=>write(tx=>enter(tx,f.privateTask.id))).toThrow(expect.objectContaining({status:422}));});
it('fresh SQL role and nested scope refusal are independent of the caller actor claim',()=>{const f=occupied();expect(()=>write(tx=>withBoardWipOverride(tx,{userId:UserRole.MEMBER,role:UserRole.ADMIN},f.scope,()=>enter(tx,f.privateTask.id)))).toThrow(expect.objectContaining({status:403}));expect(()=>write(tx=>withBoardWipOverride(tx,ctx().actor,f.scope,()=>withBoardWipOverride(tx,ctx().actor,f.scope,()=>enter(tx,f.privateTask.id))))).toThrow(expect.objectContaining({status:409}));});

it('rejects async override work before invoking it and rejects unused capabilities',()=>{const f=occupied();let invoked=false;expect(()=>write(tx=>withBoardWipOverride(tx,ctx().actor,f.scope,async()=>{invoked=true;}))).toThrow(expect.objectContaining({status:400}));expect(invoked).toBe(false);expect(()=>write(tx=>withBoardWipOverride(tx,ctx().actor,f.scope,()=>{}))).toThrow(expect.objectContaining({status:422}));});
