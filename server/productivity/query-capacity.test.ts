import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshot from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {createTaskCommands} from './tasks.js';
import {createTaskQuery} from './query.js';
const actor={userId:'synthetic-capacity',role:UserRole.ADMIN},reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)},write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:actor.userId,command:'synthetic:capacity',requestId:randomUUID(),payloadHash:'synthetic'},fn),clock={nowUtc:'2026-10-15T00:00:00Z',timezone:'Asia/Saigon'},filter={rootsOnly:true};
let initialized=false;
function setup(){if(initialized)return;write(tx=>{tx.legacy.tasks=[];tx.legacy.users=[actor.userId,'synthetic-other'].map(id=>({id,username:id,fullName:'Synthetic capacity',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:clock.nowUtc}));});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));const tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction});for(let i=0;i<2;i++)tasks.createTask({actor,expectedRevision:0,requestId:randomUUID()},{listId:'legacy-family',title:'Synthetic capacity '+i});initialized=true;}
it('bounds live plus retained expired selection identities while keeping recent owner409/foreign404',()=>{
 setup();const query=(createTaskQuery as any)({reader,selectionBudget:{references:2,rows:10,bytes:100000}}),first=query.selectTaskIds(actor,filter,clock);query.selectTaskIds(actor,filter,clock);expect(()=>query.selectTaskIds(actor,filter,clock)).toThrow(expect.objectContaining({status:429}));
 const expired={...clock,nowUtc:'2026-10-15T00:15:00Z'};expect(()=>query.resolveSelection(actor,first.id,expired)).toThrow(expect.objectContaining({status:409}));expect(()=>query.resolveSelection({...actor,userId:'synthetic-other'},first.id,expired)).toThrow(expect.objectContaining({status:404}));expect(()=>query.selectTaskIds(actor,filter,expired)).toThrow(expect.objectContaining({status:429}));
 const retired={...clock,nowUtc:'2026-10-15T00:30:00Z'};expect(query.selectTaskIds(actor,filter,retired).totalUnique).toBe(2);expect(()=>query.resolveSelection(actor,first.id,retired)).toThrow(expect.objectContaining({status:404}));
});
it('bounds total retained selected rows across references without changing query IDs',()=>{
 setup();const query=(createTaskQuery as any)({reader,selectionBudget:{references:10,rows:3,bytes:100000}}),first=query.selectTaskIds(actor,filter,clock);expect(first.totalUnique).toBe(2);expect(()=>query.selectTaskIds(actor,filter,clock)).toThrow(expect.objectContaining({status:429}));expect(query.resolveSelection(actor,first.id,clock)).toHaveLength(2);
});
it('bounds serialized selection payload bytes before retaining another snapshot',()=>{
 setup();const query=(createTaskQuery as any)({reader,selectionBudget:{references:10,rows:10,bytes:1}});expect(()=>query.selectTaskIds(actor,filter,clock)).toThrow(expect.objectContaining({status:429}));expect(query.queryTasks(actor,filter,clock,null).totalUnique).toBe(2);
});
