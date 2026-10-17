import {beforeAll,expect,it,vi} from 'vitest';
import * as recurrencePolicy from './recurrencePolicy.js';
import {randomUUID} from 'node:crypto';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import * as migrations from '../appMigrations.js';
import * as snapshots from '../appSnapshot.js';
import {UserRole} from '../../src/types.js';
import {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest} from './adapter.js';
import {registerBoardMigration} from './boardMigration.js';
import {registerBoardViewMigration} from './boardViewSchema.js';
import {registerGroupedViewMigration} from './groupViewSchema.js';
import {registerSeriesMigration} from './seriesSchema.js';
import {createRecurrenceSeriesStore} from './seriesStore.js';
import {createTaskCommands} from './tasks.js';
import {createRecurrencePreviews} from './recurrencePreview.js';

const reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args)as any,all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)as any[]};
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'synthetic:preview',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const actor=(role=UserRole.ADMIN)=>({userId:role,role}),ctx=(revision=0)=>({actor:actor(),requestId:randomUUID(),expectedRevision:revision});
const policy=(extra:any={})=>({timezone:'Asia/Saigon',base:'due',cadence:{kind:'calendar',frequency:'monthly',interval:1,invalidDate:'clamp'},end:{kind:'never'},missed:'skip',rotationMembers:[UserRole.CHILD,UserRole.MEMBER],...extra});
const store=createRecurrenceSeriesStore({reader,write:gateway.withAppWriteTransaction}),tasks=createTaskCommands({reader,write:gateway.withAppWriteTransaction}),preview=createRecurrencePreviews({reader});
const range={from:'2027-02-01',toExclusive:'2027-05-01'};
beforeAll(()=>{
 write(tx=>{tx.legacy.tasks=[];tx.legacy.notifications=[];tx.legacy.rewardLedger=[];tx.legacy.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}));});
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot:snapshots});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});write(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
 registerBoardMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});registerBoardViewMigration(migrations.registerDomainMigration);registerGroupedViewMigration(migrations.registerDomainMigration);registerSeriesMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
});
function fixture(p:any=policy(),extra:any={}){const source=tasks.createTask(ctx(),{listId:'legacy-family',title:'Synthetic virtual '+randomUUID(),due:{kind:'all_day',date:'2027-01-31',timezone:p.timezone},isShared:true,...extra});return {source,series:store.create(ctx(source.revision),source.id,p)};}
const allRows=()=>Object.fromEntries(reader.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(({name})=>[name,reader.all('SELECT * FROM "'+name+'"')]));

it('returns virtual successors in a half-open local range while every installation table remains unchanged',()=>{
 const f=fixture(),before=allRows(),rows=preview.previewOccurrences(actor(),f.series.id,range);
 expect(rows).toEqual(['2027-02-28','2027-03-31','2027-04-30'].map((date,i)=>({kind:'virtual',seriesId:f.series.id,taskId:f.source.id,seriesRevision:1,ordinal:i+1,due:{kind:'all_day',date,timezone:'Asia/Saigon'}})));
 expect(allRows()).toEqual(before);expect(preview.previewOccurrences(actor(),f.series.id,{from:'2027-02-28',toExclusive:'2027-03-31'})).toHaveLength(1);
 if(rows[0].kind!=='virtual'||rows[0].due.kind!=='all_day')throw Error('Expected dated virtual row');rows[0].due.date='2099-01-01';const fresh=preview.previewOccurrences(actor(),f.series.id,range)[0];expect(fresh).toMatchObject({kind:'virtual',due:{kind:'all_day',date:'2027-02-28'}});expect(allRows()).toEqual(before);
});
it.each([UserRole.CHILD,UserRole.GUEST])('allows %s to read a shared Task preview without revealing private configuration or granting edits',role=>{
 const f=fixture(),before=allRows(),rows=preview.previewOccurrences(actor(role),f.series.id,range);expect(rows).toEqual(preview.previewOccurrences(actor(),f.series.id,range));expect(JSON.stringify(rows)).not.toMatch(/rotationMembers|policy|password|rewardPoints|acceptedCount/);expect(()=>store.get(actor(role),f.series.id)).toThrow(expect.objectContaining({status:403}));expect(allRows()).toEqual(before);
});
it('masks private and missing series equally, including malformed range before object disclosure',()=>{
 const f=fixture(policy(),{isShared:false}),denied=(id:string,r:any=range)=>{try{preview.previewOccurrences(actor(UserRole.CHILD),id,r);throw Error('expected refusal');}catch(e){return {status:(e as any).status,message:(e as Error).message,code:(e as any).code};}};
 expect(denied(f.series.id)).toEqual(denied(randomUUID()));expect(denied(f.series.id).status).toBe(404);expect(denied(f.series.id,{from:'invalid'})).toEqual(denied(randomUUID(),{from:'invalid'}));
});
it('rechecks current role and grants on every read rather than caching prior preview authority',()=>{
 const f=fixture(policy(),{isShared:false});write(tx=>tx.run('UPDATE productivity_list_grants SET permission=? WHERE list_id=? AND user_id=?','read','legacy-family',UserRole.MEMBER));
 try{expect(preview.previewOccurrences(actor(UserRole.MEMBER),f.series.id,range)).toHaveLength(3);write(tx=>tx.run('DELETE FROM productivity_list_grants WHERE list_id=? AND user_id=?','legacy-family',UserRole.MEMBER));expect(()=>preview.previewOccurrences(actor(UserRole.MEMBER),f.series.id,range)).toThrow(expect.objectContaining({status:404}));}finally{write(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'manage'));}
 expect(()=>preview.previewOccurrences({userId:UserRole.CHILD,role:UserRole.ADMIN},f.series.id,range)).toThrow(expect.objectContaining({status:403}));
});
it('applies skip, explicit no-date and rescheduled exceptions even when the original slot lies outside the range',()=>{
 const f=fixture();store.saveException(ctx(1),f.series.id,1,{kind:'skip'});store.saveException(ctx(2),f.series.id,3,{kind:'due',due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}});store.saveException(ctx(3),f.series.id,2,{kind:'due',due:{kind:'none'}});const before=allRows();
 expect(preview.previewOccurrences(actor(),f.series.id,{from:'2027-02-01',toExclusive:'2027-04-01'})).toEqual([{kind:'virtual',seriesId:f.series.id,taskId:f.source.id,seriesRevision:4,ordinal:3,due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}}]);expect(allRows()).toEqual(before);
});
it('filters moved-out exceptions and never resurrects slots beyond the series count or end date',()=>{
 const f=fixture(policy({end:{kind:'date',date:'2027-03-31'}}));store.saveException(ctx(1),f.series.id,1,{kind:'due',due:{kind:'all_day',date:'2027-04-02',timezone:'Asia/Saigon'}});store.saveException(ctx(2),f.series.id,3,{kind:'due',due:{kind:'all_day',date:'2027-02-03',timezone:'Asia/Saigon'}});
 expect(preview.previewOccurrences(actor(),f.series.id,range).map((r:any)=>r.ordinal)).toEqual([2]);
 const counted=fixture(policy({end:{kind:'count',count:2}}));expect(preview.previewOccurrences(actor(),counted.series.id,range).map((r:any)=>r.ordinal)).toEqual([1]);
});
it('does not forecast unknown completion acceptance or advance any series counters',()=>{
 const f=fixture(policy({base:'completion'})),before=allRows();expect(preview.previewOccurrences(actor(),f.series.id,range)).toEqual([]);expect(allRows()).toEqual(before);
});
it('returns explicit resolution metadata for a DST gap and accepts a canonical exception resolving it',()=>{
 const p=policy({timezone:'America/New_York',cadence:{kind:'dates',dates:['2027-03-14']}}),f=fixture(p,{due:{kind:'timed',instantUtc:'2027-01-31T07:30:00Z',timezone:p.timezone}}),r={from:'2027-03-14',toExclusive:'2027-03-15'};
 expect(preview.previewOccurrences(actor(),f.series.id,r)).toEqual([{kind:'time-resolution-required',seriesId:f.series.id,taskId:f.source.id,seriesRevision:1,ordinal:1,date:'2027-03-14',wallTime:'02:30:00.000',timezone:p.timezone,reason:'explicit-instant-required'}]);
 const due={kind:'timed',instantUtc:'2027-03-14T07:30:00Z',timezone:p.timezone};store.saveException(ctx(1),f.series.id,1,{kind:'due',due});expect(preview.previewOccurrences(actor(),f.series.id,r)).toEqual([{kind:'virtual',seriesId:f.series.id,taskId:f.source.id,seriesRevision:2,ordinal:1,due}]);
});
it('jumps to a requested monthly range instead of scanning every historical ordinal',()=>{
 const f=fixture(policy(),{due:{kind:'all_day',date:'1000-01-31',timezone:'Asia/Saigon'}}),before=allRows();expect(preview.previewOccurrences(actor(),f.series.id,range).map((r:any)=>r.due.date)).toEqual(['2027-02-28','2027-03-31','2027-04-30']);expect(allRows()).toEqual(before);
});
it('refuses more than1000 matching rescheduled slots rather than returning a truncated successful preview',()=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'}}));write(tx=>{for(let i=1;i<=1001;i++)tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)',f.series.id,i,'due',JSON.stringify({kind:'all_day',date:'2027-02-02',timezone:'Asia/Saigon'}),1);});const before=allRows();expect(()=>preview.previewOccurrences(actor(),f.series.id,{from:'2027-02-02',toExclusive:'2027-02-03'})).toThrow(expect.objectContaining({status:422}));expect(allRows()).toEqual(before);
});
it('returns all exactly1000 matching slots and accepts an exactly366day local range',()=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'}}));write(tx=>{for(let i=1;i<=1000;i++)tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)',f.series.id,i,'due',JSON.stringify({kind:'all_day',date:'2027-02-02',timezone:'Asia/Saigon'}),1);});const before=allRows(),result=preview.previewOccurrences(actor(),f.series.id,{from:'2027-02-02',toExclusive:'2027-02-03'});expect(result).toHaveLength(1000);expect(new Set(result.map(r=>r.ordinal)).size).toBe(1000);expect(result.map(r=>r.ordinal)).toEqual(Array.from({length:1000},(_,i)=>i+1));expect(allRows()).toEqual(before);
 const monthly=fixture();expect(preview.previewOccurrences(actor(),monthly.series.id,{from:'2027-01-01',toExclusive:'2028-01-02'})).toHaveLength(11);
});
it.each([{from:'2027-02-30',toExclusive:'2027-03-01'},{from:'2027-03-01',toExclusive:'2027-03-01'},{from:'2027-03-02',toExclusive:'2027-03-01'},{from:'2027-01-01',toExclusive:'2028-01-03'},{...range,limit:1},{...range,acceptedCompletedAt:'2027-03-01T00:00:00Z'}])('refuses invalid, oversized or forged preview range %# without changing data',r=>{
 const f=fixture(),before=allRows();expect(()=>preview.previewOccurrences(actor(),f.series.id,r)).toThrow(expect.objectContaining({status:422}));expect(allRows()).toEqual(before);
});

it('retains explicit completion deadlines at current and later ordinals without inventing acceptance or changing tables',()=>{
 const f=fixture(policy({base:'completion',end:{kind:'count',count:5}}));
 store.saveException(ctx(1),f.series.id,1,{kind:'due',due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}});
 store.saveException(ctx(2),f.series.id,2,{kind:'due',due:{kind:'all_day',date:'2027-03-15',timezone:'Asia/Saigon'}});
 store.saveException(ctx(3),f.series.id,3,{kind:'skip'});store.saveException(ctx(4),f.series.id,4,{kind:'due',due:{kind:'none'}});
 const before=allRows();expect(preview.previewOccurrences(actor(),f.series.id,range)).toEqual([1,2].map((ordinal)=>({kind:'virtual',seriesId:f.series.id,taskId:f.source.id,seriesRevision:5,ordinal,due:{kind:'all_day',date:ordinal===1?'2027-02-15':'2027-03-15',timezone:'Asia/Saigon'}})));expect(allRows()).toEqual(before);
});
it('bounds explicitly dated unknown completion slots by count and local end date',()=>{
 const counted=fixture(policy({base:'completion',end:{kind:'count',count:2}}));
 write(tx=>{for(const ordinal of [1,2])tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)',counted.series.id,ordinal,'due',JSON.stringify({kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}),1);});
 expect(preview.previewOccurrences(actor(),counted.series.id,range).map(r=>r.ordinal)).toEqual([1]);
 const dated=fixture(policy({base:'completion',end:{kind:'date',date:'2027-02-15'}}));store.saveException(ctx(1),dated.series.id,1,{kind:'due',due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}});store.saveException(ctx(2),dated.series.id,2,{kind:'due',due:{kind:'all_day',date:'2027-02-16',timezone:'Asia/Saigon'}});
 expect(preview.previewOccurrences(actor(),dated.series.id,range).map(r=>r.ordinal)).toEqual([1]);
});
it('projects all366 explicit successor dates without revalidating the whole policy for every candidate',()=>{
 const dates=Array.from({length:366},(_,i)=>new Date(Date.UTC(2028,0,1+i)).toISOString().slice(0,10));
 const f=fixture(policy({cadence:{kind:'dates',dates}}),{due:{kind:'all_day',date:'2027-12-31',timezone:'Asia/Saigon'}}),before=allRows(),validation=vi.spyOn(recurrencePolicy,'normalizeRecurrencePolicy');
 try{const rows=preview.previewOccurrences(actor(),f.series.id,{from:'2028-01-01',toExclusive:'2029-01-01'});expect(rows.map((r:any)=>r.due.date)).toEqual(dates);expect(rows.map(r=>r.ordinal)).toEqual(dates.map((_,i)=>i+1));expect(validation.mock.calls.length).toBeLessThanOrEqual(2);expect(allRows()).toEqual(before);}finally{validation.mockRestore();}
});

it.each([1,2])('returns an empty distant preview after a historical daily series exhausted its count %i',count=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'},end:{kind:'count',count}}),{due:{kind:'all_day',date:'1000-01-01',timezone:'Asia/Saigon'}}),before=allRows();
 expect(preview.previewOccurrences(actor(),f.series.id,range)).toEqual([]);expect(allRows()).toEqual(before);
});
it('includes an in-bound historical exception moved into a distant preview without scanning exhausted ordinals',()=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'},end:{kind:'count',count:2}}),{due:{kind:'all_day',date:'1000-01-01',timezone:'Asia/Saigon'}});
 store.saveException(ctx(1),f.series.id,1,{kind:'due',due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}});const before=allRows();
 expect(preview.previewOccurrences(actor(),f.series.id,range)).toEqual([{kind:'virtual',seriesId:f.series.id,taskId:f.source.id,seriesRevision:2,ordinal:1,due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}}]);expect(allRows()).toEqual(before);
});
it('does not revive restored exceptions beyond the exhausted historical count',()=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'},end:{kind:'count',count:2}}),{due:{kind:'all_day',date:'1000-01-01',timezone:'Asia/Saigon'}});
 write(tx=>tx.run('INSERT INTO productivity_series_exceptions VALUES(?,?,?,?,?)',f.series.id,2,'due',JSON.stringify({kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}),1));const before=allRows();
 expect(preview.previewOccurrences(actor(),f.series.id,range)).toEqual([]);expect(allRows()).toEqual(before);
});
it('retains the last supported moved exception of a maximum-count historical series',()=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'},end:{kind:'count',count:100000}}),{due:{kind:'all_day',date:'1000-01-01',timezone:'Asia/Saigon'}});
 store.saveException(ctx(1),f.series.id,99999,{kind:'due',due:{kind:'all_day',date:'2027-02-15',timezone:'Asia/Saigon'}});const before=allRows();
 expect(preview.previewOccurrences(actor(),f.series.id,range).map(row=>row.ordinal)).toEqual([99999]);expect(allRows()).toEqual(before);
});
it.each([{kind:'never'},{kind:'date',date:'2027-12-31'}])('retains the supported ordinal bound for a distant unexhausted $kind series',end=>{
 const f=fixture(policy({cadence:{kind:'calendar',frequency:'daily',interval:1,invalidDate:'clamp'},end}),{due:{kind:'all_day',date:'1000-01-01',timezone:'Asia/Saigon'}}),before=allRows();
 expect(()=>preview.previewOccurrences(actor(),f.series.id,range)).toThrow(expect.objectContaining({status:422}));expect(allRows()).toEqual(before);
});
