import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import * as db from '../db.js';
import {createAuth} from '../auth.js';
import {NativeSessionStore} from '../authStore.js';
import {createApp} from '../app.js';
import {syntheticDependencies} from '../../tests/app-fixture.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createProductivityPorts} from './ports.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:board-http',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const ctx=(revision=0)=>({actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN},expectedRevision:revision,requestId:randomUUID()});
let ready=false;
async function fixture(work:(f:any)=>Promise<void>,version:7|8=8){
 if(!ready){write(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));ready=true;}
 if(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").version===6){registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});}
 if(version===8&&reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").version===7){registerBoardViewMigration(migrations.registerDomainMigration);migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});}
 const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),list=structure.saveList(ctx(),{title:'Synthetic private HTTP board',isShared:false}),task=createTaskCommands({reader,write:gateway.withAppWriteTransaction}).createTask(ctx(),{listId:list.id,title:'Synthetic hidden board task'});
 const board=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}).configure(ctx(),{listId:list.id,mode:'sections',policies:[]});
 const deps:any=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.productivity=createProductivityPorts(sqlite,gateway);deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-board-http-key'});
 const tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,deps.auth.issue(user)])),handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!}as any,deps),server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const send=(body:any,role:string|null=UserRole.ADMIN,requestId=randomUUID())=>new Promise<any>((resolve,reject)=>{const text=JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity/views',agent:false,method:'POST',headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'content-type':'application/json','content-length':Buffer.byteLength(text),'x-request-id':requestId}},res=>{let raw='';res.on('data',part=>raw+=String(part));res.on('end',()=>{let value;try{value=JSON.parse(raw);}catch{value=raw;}resolve({status:res.statusCode,body:value});});});req.on('error',reject);req.end(text);});
 try{await work({list,task,board,send,structure});}finally{handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
const packet=(boardId:string)=>({expectedRevision:0,input:{title:'Synthetic bound HTTP view',filter:{rootsOnly:true},kind:'kanban',config:{kind:'kanban',mode:'sections',group:'none',sort:'rank',columns:[],boardId}}});
it('existing schema7 refuses saved board references without automatic migration',()=>fixture(async f=>{expect((await f.send(packet(f.board.id))).status).toBe(409);expect(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").version).toBe(7);expect(reader.all('SELECT * FROM productivity_views')).toEqual([]);},7));
it('new reference uses existing sessions and closed request fields',()=>fixture(async f=>{expect((await f.send(packet(f.board.id),null)).status).toBe(401);expect((await f.send(packet(f.board.id),UserRole.GUEST)).status).toBe(403);expect((await f.send({...packet(f.board.id),actor:{userId:UserRole.ADMIN,role:UserRole.ADMIN}})).status).toBe(400);}));
it.each([UserRole.CHILD,UserRole.MEMBER])('role %s cannot bind a foreign private board',role=>fixture(async f=>{const result=await f.send(packet(f.board.id),role);expect(result.status).toBe(404);expect(JSON.stringify(result.body)).not.toContain(f.task.id);expect(JSON.stringify(result.body)).not.toContain(f.task.title);}));
it('actual HTTP saves a private board reference once and returns no Task data',()=>fixture(async f=>{const request=randomUUID(),input=packet(f.board.id),first=await f.send(input,UserRole.ADMIN,request);expect(first.status).toBe(200);expect(first.body.view.config.boardId).toBe(f.board.id);expect(first.body.view.ownerId).toBe(UserRole.ADMIN);expect(JSON.stringify(first.body)).not.toContain(f.task.id);expect(await f.send(input,UserRole.ADMIN,request)).toEqual(first);}));
it('revoked read grant blocks a cached HTTP save result before replay',()=>fixture(async f=>{f.structure.setListGrant(ctx(f.list.revision),f.list.id,{userId:UserRole.MEMBER,permission:'read'});const request=randomUUID(),input=packet(f.board.id);expect((await f.send(input,UserRole.MEMBER,request)).status).toBe(200);const current=f.structure.getCatalog(ctx().actor).lists.find((l:any)=>l.id===f.list.id);f.structure.setListGrant(ctx(current.revision),f.list.id,{userId:UserRole.MEMBER,permission:null});expect((await f.send(input,UserRole.MEMBER,request)).status).toBe(404);}));
it('child can save its own reference to a shared board without gaining private Task access',()=>fixture(async f=>{const shared=f.structure.saveList(ctx(),{title:'Synthetic shared bound board',isShared:true}),board=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}).configure(ctx(),{listId:shared.id,mode:'sections',policies:[]}),result=await f.send(packet(board.id),UserRole.CHILD);expect(result.status).toBe(200);expect(result.body.view.ownerId).toBe(UserRole.CHILD);expect(result.body.view.config.boardId).toBe(board.id);expect(JSON.stringify(result.body)).not.toContain(f.task.id);}));
