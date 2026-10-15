import {createGroupedBoardProjection} from './groupedBoard.js';
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
import {createProductivityPorts} from './ports.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import {createTaskViews} from './views.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createBoardProjection} from './boardProjection.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:grouped-board-http',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const ctx=(revision=0,role=UserRole.ADMIN)=>({actor:{userId:role,role},expectedRevision:revision,requestId:randomUUID()});
let ready=false;
async function fixture(work:(f:any)=>Promise<void>){
 if(!ready){write(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshot.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});registerBoardViewMigration(migrations.registerDomainMigration);migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});ready=true;}
 const structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),list=structure.saveList(ctx(),{title:'Synthetic HTTP projected list',isShared:true}),visible=tasks.createTask(ctx(),{listId:list.id,title:'Synthetic HTTP shared',isShared:true}),privateTask=tasks.createTask(ctx(),{listId:list.id,title:'Synthetic HTTP private',isShared:false}),board=createBoardCatalog({reader,write:gateway.withAppWriteTransaction}).configure(ctx(),{listId:list.id,mode:'sections',policies:[{columnKey:'none',policy:'hard',limit:3}]}),views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),save=(role:UserRole)=>views.saveView(ctx(0,role),{title:'Synthetic owned HTTP board',filter:{rootsOnly:true},kind:'kanban',config:{kind:'kanban',mode:'sections',group:'priority',sort:'rank',columns:[],boardId:board.id}}),admin=save(UserRole.ADMIN),child=save(UserRole.CHILD);
 const deps:any=syntheticDependencies({phase:'ready',storageWritable:true});deps.db=db;deps.sqlite=sqlite;deps.productivity=createProductivityPorts(sqlite,gateway);deps.productivity.groupedBoard=createGroupedBoardProjection({reader,views,pageSize:1});deps.auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:()=> 'synthetic-board-project-http-key'});
 const tokens=Object.fromEntries(db.FamilyDB.getUsers().map(user=>[user.id,deps.auth.issue(user)])),handle=await createApp({production:true,codeRoot:process.cwd(),dataRoot:process.env.DATA_DIR!}as any,deps),server=http.createServer(handle.app).listen(0,'127.0.0.1');await once(server,'listening');
 const get=(id=admin.id,role:string|null=UserRole.ADMIN,query='')=>new Promise<any>((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:(server.address()as any).port,path:'/api/productivity/boards/'+id+'/grouped'+query,agent:false,headers:role?{Authorization:'Bearer '+tokens[role]}:{}},res=>{let raw='';res.on('data',p=>raw+=String(p));res.on('end',()=>{resolve({status:res.statusCode,body:JSON.parse(raw),headers:res.headers});});});req.on('error',reject);req.end();});
 try{await work({get,admin,child,list,board,visible,privateTask});}finally{handle.endStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await handle.drainHandlers();await handle.dispose();}
}
it('grouped HTTP requires authentication and uses private no-store response headers',()=>fixture(async f=>{expect((await f.get(f.admin.id,null)).status).toBe(401);const result=await f.get();expect(result.status).toBe(200);expect(result.headers['cache-control']).toContain('no-store');expect(result.body.group).toBe('priority');expect(result.body.tasks).toHaveLength(1);expect(result.body.cards).toHaveLength(1);expect(result.body.cards[0].taskId).toBe(result.body.tasks[0].id);}));
it('child grouped HTTP omits private identities, bodies and full-scope WIP counts',()=>fixture(async f=>{const result=await f.get(f.child.id,UserRole.CHILD);expect(result.status).toBe(200);expect(result.body.tasks.map((t:any)=>t.id)).toEqual([f.visible.id]);expect(result.body.totalUnique).toBe(1);expect(result.body.columns.every((c:any)=>c.wip.activeRootCount===null)).toBe(true);expect(JSON.stringify(result.body)).not.toContain(f.privateTask.id);expect(JSON.stringify(result.body)).not.toContain(f.privateTask.title);expect((await f.get(f.admin.id,UserRole.CHILD)).status).toBe(404);}));
it('grouped HTTP paginates canonical bodies once and rejects untrusted clocks and options',()=>fixture(async f=>{const first=await f.get();expect(first.status).toBe(200);const second=await f.get(f.admin.id,UserRole.ADMIN,'?cursor='+encodeURIComponent(first.body.nextCursor));expect(second.status).toBe(200);expect(second.body.nextCursor).toBeNull();expect(new Set([...first.body.tasks,...second.body.tasks].map((t:any)=>t.id)).size).toBe(2);for(const query of ['?nowUtc=1900-01-01','?actor=admin','?pageSize=99999','?cursor=forged'])expect((await f.get(f.admin.id,UserRole.ADMIN,query)).status).toBe(400);}));
it('grouped HTTP immediately rechecks archived list access and preserves all canonical tasks',()=>fixture(async f=>{const before=reader.all('SELECT * FROM productivity_tasks ORDER BY id');expect((await f.get()).status).toBe(200);expect(reader.all('SELECT * FROM productivity_tasks ORDER BY id')).toEqual(before);write(tx=>tx.run("UPDATE productivity_catalog_revisions SET archived_at='2026-10-15T00:00:00Z' WHERE entity_kind='list' AND entity_id=?",f.list.id));expect((await f.get()).status).toBe(404);}));
