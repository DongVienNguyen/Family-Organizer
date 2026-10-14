import type * as Sqlite from '../sqlite.js';
import type * as Gateway from '../appStore.js';
import type * as Migrations from '../appMigrations.js';
import type * as Snapshot from '../appSnapshot.js';
import type {Task} from '../../src/types.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {registerProductivityMigration,productivityMigrationChecksum,migrateTasks} from './migrate.js';
import {loadTasks,loadTask,savePilotTask,installTaskWriteHooks,projectLegacyTask as projection} from './store.js';
import {markCanonicalReaderReady,requireCanonicalReader} from './bridgeState.js';
import {parseLegacyDue} from '../../src/features/productivity/dates.js';
import {assertLegacyTask} from './legacy.js';
export type BridgePorts={sqlite:typeof Sqlite;gateway:typeof Gateway;migrations:typeof Migrations;snapshot:typeof Snapshot};
const configured=new WeakSet<object>();
function assertMigration(reader:Pick<Gateway.AppWriteTx,'all'>):void {
 const migrations=reader.all("SELECT version,checksum FROM app_migrations WHERE namespace='productivity' ORDER BY version");
 if(migrations.length!==1||migrations[0].version!==1||migrations[0].checksum!==productivityMigrationChecksum)throw new Error('Unsupported productivity migration before activation');
}
function active(reader:Pick<Gateway.AppWriteTx,'get'|'all'>):boolean {
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(marker===undefined)return false;if(marker!=='1')throw new Error('Unsupported canonical task marker');assertMigration(reader);return true;
}
export function configureCanonicalTaskBridge(ports:BridgePorts):void {
 if(configured.has(ports.sqlite))return;
 registerProductivityMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable,registerValidator:ports.snapshot.registerSnapshotValidator});
 const connection=ports.sqlite.sqliteConnection();
 const reader={get:(sql:string,...args:any[])=>connection.prepare(sql).get(...args),all:(sql:string,...args:any[])=>connection.prepare(sql).all(...args)};
 let synchronizing=false;
 ports.sqlite.installLegacyTaskStorageAdapter({enabled:()=>active(reader),read:()=>loadTasks(reader).filter(row=>row.deletedAt===null).map(projection),write(rows){const tx=ports.gateway.currentAppWriteTx();if(!tx)throw new Error('Canonical tasks require the application gateway');synchronizing=true;try{syncLegacyTasks(tx,rows);}finally{synchronizing=false;}}});
 installTaskWriteHooks({before(tx){if(!synchronizing&&active(tx))ports.sqlite.sqliteFlushLegacyTasks(tx.legacy);},after(tx){if(!synchronizing&&active(tx))ports.sqlite.sqliteRefreshCanonicalTasks(tx.legacy);}});
 configured.add(ports.sqlite);
 markCanonicalReaderReady();
}
export function legacyTaskDigest(rows:Task[]):string {return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
export function activateCanonicalTasks(tx:Gateway.AppWriteTx,expectedDigest:string):{alreadyActive:boolean;tasks:number} {
 requireCanonicalReader();
 assertMigration(tx);
 if(active(tx))return {alreadyActive:true,tasks:loadTasks(tx).filter(r=>r.deletedAt===null).length};
 if(!/^[a-f0-9]{64}$/.test(expectedDigest)||legacyTaskDigest(tx.legacy.tasks)!==expectedDigest)throw new Error('Legacy source changed since preview');
 const rows=loadTasks(tx);if(rows.length!==tx.legacy.tasks.length)throw new Error('Pilot source cardinality changed');
 const byId=new Map(rows.map(row=>[row.id,row]));
 for(const legacy of tx.legacy.tasks){const row=byId.get(legacy.id);if(!row||!isDeepStrictEqual(row.legacy,legacy)||row.deletedAt!==null)throw new Error('Pilot source changed since preview');projection(row);}
 tx.run('DELETE FROM tasks');tx.run('INSERT INTO app_meta(key,value) VALUES(?,?)','productivity_active','1');
 return {alreadyActive:false,tasks:rows.length};
}
function syncLegacyTasks(tx:Gateway.AppWriteTx,after:Task[]):void {
 const rows=loadTasks(tx),byId=new Map(rows.map(row=>[row.id,row])),seen=new Set<string>();
 let nextRank=Math.min(0,...rows.map(row=>row.rank))-1024;
 for(const task of after){
  assertLegacyTask(task);if(seen.has(task.id))throw new Error('Duplicate legacy task ID');seen.add(task.id);
  let row=byId.get(task.id);
  if(!row){migrateTasks(tx,[task]);row=loadTask(tx,task.id)!;row.rank=nextRank;nextRank-=1024;}
  else if(row.deletedAt!==null)throw new Error('Legacy writes cannot revive a deleted canonical task');
  else if(isDeepStrictEqual(projection(row),task))continue;
  const due=task.dueDate===projection(row).dueDate?row.due:parseLegacyDue(task.dueDate,'Asia/Saigon').due;
  if(due.kind==='none'&&task.dueDate!==''&&task.dueDate!==projection(row).dueDate)throw new Error('Legacy deadline needs explicit recovery');
  const lifecycle=task.status==='overdue'?(row.lifecycle==='in_progress'?'in_progress':'todo'):task.status;
  savePilotTask(tx,{...row,title:task.title,body:task.description,lifecycle,priority:task.priority,due,creatorId:task.creatorId,assigneeId:task.assigneeId,isShared:task.isShared,tagIds:[...task.tags],pendingApproval:task.pendingApproval??false,rewardPoints:task.rewardPoints??0,legacy:structuredClone(task),revision:row.revision+1});
 }
 for(const row of rows)if(row.deletedAt===null&&!seen.has(row.id))savePilotTask(tx,{...row,deletedAt:new Date().toISOString(),revision:row.revision+1});
}
