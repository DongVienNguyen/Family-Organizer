import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskViews} from './views.js';
const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:views',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const actor={userId:UserRole.MEMBER,role:UserRole.MEMBER},admin={userId:UserRole.ADMIN,role:UserRole.ADMIN},guest={userId:UserRole.GUEST,role:UserRole.GUEST};
const ctx=(revision=0,who=actor,requestId=randomUUID())=>({actor:who,expectedRevision:revision,requestId});
const draft=()=>({title:'Synthetic saved view',filter:{rootsOnly:true,tagMatch:'all' as const},kind:'list' as const,config:{kind:'list' as const,sort:'rank' as const,group:'none' as const}});
let initialized=false;
function setup(){if(!initialized){fixture(tx=>{tx.legacy.tasks=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-14T00:00:00Z'}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));initialized=true;}}
const api=()=>createTaskViews({reader,write:gateway.withAppWriteTransaction});
it('saved views derive owner and revision, return server ID and keep typed config/filter',()=>{
 setup();const views=api(),saved=views.saveView(ctx(),draft());expect(saved).toMatchObject({...draft(),ownerId:actor.userId,revision:1});expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);expect(views.getView(actor,saved.id)).toEqual(saved);expect(views.listViews(actor).some(row=>row.id===saved.id)).toBe(true);
});
it('saved view IDs and counts are owner-scoped even for another admin',()=>{
 setup();const views=api(),saved=views.saveView(ctx(),draft());expect(()=>views.getView(admin,saved.id)).toThrow(expect.objectContaining({status:404}));expect(views.listViews(admin)).toEqual([]);expect(()=>views.saveView(ctx(1,admin),{...draft(),id:saved.id})).toThrow(expect.objectContaining({status:404}));
});
it('saved view writes use fresh roles and Guest is read-only before idempotency cache access',()=>{
 setup();const views=api();expect(()=>views.saveView(ctx(0,guest),draft())).toThrow(expect.objectContaining({status:403}));expect(()=>views.saveView(ctx(0,{...actor,role:UserRole.ADMIN}),draft())).toThrow(expect.objectContaining({status:403}));const key=randomUUID(),saved=views.saveView(ctx(0,actor,key),draft());fixture(tx=>{const user=tx.legacy.users.find(row=>row.id===actor.userId)!;user.isDeleted=true;});expect(()=>views.saveView(ctx(0,actor,key),draft())).toThrow(expect.objectContaining({status:403}));fixture(tx=>{tx.legacy.users.find(row=>row.id===actor.userId)!.isDeleted=false;});expect(views.getView(actor,saved.id)).toEqual(saved);
});
it('saved view retry returns one committed ID while stale revision and payload reuse conflict',()=>{
 setup();const views=api(),request=randomUUID(),command=ctx(0,actor,request),input=draft(),saved=views.saveView(command,input);expect(views.saveView(command,input)).toEqual(saved);expect(()=>views.saveView(command,{...input,title:'Synthetic changed retry'})).toThrow(expect.objectContaining({status:409}));const updated=views.saveView(ctx(saved.revision),{...input,id:saved.id,title:'Synthetic renamed'});expect(updated.revision).toBe(2);expect(()=>views.saveView(ctx(1),{...input,id:saved.id})).toThrow(expect.objectContaining({status:409}));expect(views.getView(actor,saved.id)).toEqual(updated);
});
it.each([{...draft(),ownerId:'forged'},{...draft(),config:{kind:'calendar',style:'agenda',range:{from:'2026-10-14T00:00:00Z',toExclusive:'2026-10-15T00:00:00Z'}}},{...draft(),filter:{rootsOnly:true,public:true}}])('invalid typed saved configuration is rejected before writing',input=>{
 setup();const views=api(),before=reader.all('SELECT * FROM productivity_views');expect(()=>views.saveView(ctx(),input as any)).toThrow(expect.objectContaining({status:400}));expect(reader.all('SELECT * FROM productivity_views')).toEqual(before);
});
