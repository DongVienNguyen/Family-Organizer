import {registerTaskNotificationMigration,productivityTaskNotificationChecksum} from './notificationSchema.js';
import {productivityVersionsFrom} from './knownVersions.js';
import {registerLegacyCutoverMigration,productivityLegacyCutoverChecksum} from './legacyCutoverSchema.js';
import {registerOccurrenceSkipMigration,productivityOccurrenceSkipChecksum} from './occurrenceSkipSchema.js';
import {registerOccurrenceMigration,productivityOccurrenceChecksum} from './occurrenceSchema.js';
import {registerSeriesMigration,productivitySeriesChecksum} from './seriesSchema.js';
import {registerGroupedViewMigration,productivityGroupedViewChecksum} from './groupViewSchema.js';
import {registerBoardViewMigration,productivityBoardViewChecksum} from './boardViewSchema.js';
import {registerBoardMigration,productivityBoardChecksum} from './boardMigration.js';
import {hasTagOwnership,assertTagSelection,visibleTagLabels} from './tagPolicy.js';
import {installCanonicalTaskVisibility} from '../legacyVisibility.js';
import {createTaskAccess,listPermission} from './access.js';
import {UserRole} from '../../src/types.js';
import type * as Sqlite from '../sqlite.js';
import type * as Gateway from '../appStore.js';
import type * as Migrations from '../appMigrations.js';
import type * as Snapshot from '../appSnapshot.js';
import type {Task} from '../../src/types.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {registerProductivityMigration,productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum,productivityViewChecksum,productivityMatrixChecksum,migrateTasks} from './migrate.js';
import {loadTasks,loadTask,savePilotTask,installTaskWriteHooks,projectLegacyTask as projection} from './store.js';
import {markCanonicalReaderReady,requireCanonicalReader} from './bridgeState.js';
import {parseLegacyDue} from '../../src/features/productivity/dates.js';
import {assertLegacyTask} from './legacy.js';
import {assertCurrentTaskTree} from './structureInvariant.js';
export type BridgePorts={sqlite:typeof Sqlite;gateway:typeof Gateway;migrations:typeof Migrations;snapshot:typeof Snapshot};
const configured=new WeakSet<object>();
function assertMigration(reader:Pick<Gateway.AppWriteTx,'all'>):void {
 const migrations=reader.all("SELECT version,checksum FROM app_migrations WHERE namespace='productivity' ORDER BY version");
 if(!productivityVersionsFrom(1).includes(migrations.length)||migrations[0].version!==1||migrations[0].checksum!==productivityMigrationChecksum||(migrations.length>=2&&(migrations[1].version!==2||migrations[1].checksum!==productivityStructureChecksum)))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=3&&(migrations[2].version!==3||migrations[2].checksum!==productivityTagChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=4&&(migrations[3].version!==4||migrations[3].checksum!==productivityPinChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=5&&(migrations[4].version!==5||migrations[4].checksum!==productivityViewChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=6&&(migrations[5].version!==6||migrations[5].checksum!==productivityMatrixChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=7&&(migrations[6].version!==7||migrations[6].checksum!==productivityBoardChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=8&&(migrations[7].version!==8||migrations[7].checksum!==productivityBoardViewChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=9&&(migrations[8].version!==9||migrations[8].checksum!==productivityGroupedViewChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=10&&(migrations[9].version!==10||migrations[9].checksum!==productivitySeriesChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=11&&(migrations[10].version!==11||migrations[10].checksum!==productivityOccurrenceChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=12&&(migrations[11].version!==12||migrations[11].checksum!==productivityOccurrenceSkipChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=13&&(migrations[12].version!==13||migrations[12].checksum!==productivityLegacyCutoverChecksum))throw new Error('Unsupported productivity migration before activation');
 if(migrations.length>=14&&(migrations[13].version!==14||migrations[13].checksum!==productivityTaskNotificationChecksum))throw new Error('Unsupported productivity migration before activation');
}
function active(reader:Pick<Gateway.AppWriteTx,'get'|'all'>):boolean {
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(marker===undefined)return false;if(marker!=='1')throw new Error('Unsupported canonical task marker');assertMigration(reader);return true;
}
export function configureCanonicalTaskBridge(ports:BridgePorts):void {
 if(configured.has(ports.sqlite))return;
 registerProductivityMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable,registerValidator:ports.snapshot.registerSnapshotValidator});
 const connection=ports.sqlite.sqliteConnection();
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=7)registerBoardMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable});
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=8)registerBoardViewMigration(ports.migrations.registerDomainMigration);
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=9)registerGroupedViewMigration(ports.migrations.registerDomainMigration);
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=10)registerSeriesMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable});
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=11)registerOccurrenceMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable});
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=12)registerOccurrenceSkipMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable});
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=13)registerLegacyCutoverMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable});
 if((connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=14)registerTaskNotificationMigration({registerMigration:ports.migrations.registerDomainMigration,registerSnapshot:ports.snapshot.registerSnapshotTable,registerRestorePolicy:ports.snapshot.registerSnapshotRestorePolicy});
 const reader={get:(sql:string,...args:any[])=>connection.prepare(sql).get(...args),all:(sql:string,...args:any[])=>connection.prepare(sql).all(...args)};
 let synchronizing=false;
 ports.sqlite.installLegacyTaskStorageAdapter({enabled:()=>active(reader),read:()=>loadTasks(reader).filter(row=>row.deletedAt===null).map(projection),write(rows){const tx=ports.gateway.currentAppWriteTx();if(!tx)throw new Error('Canonical tasks require the application gateway');synchronizing=true;try{syncLegacyTasks(tx,rows);}finally{synchronizing=false;}}});
 installTaskWriteHooks({before(tx){if(!synchronizing&&active(tx))ports.sqlite.sqliteFlushLegacyTasks(tx.legacy);},after(tx){if(!synchronizing&&active(tx))ports.sqlite.sqliteRefreshCanonicalTasks(tx.legacy);}});
 const access=createTaskAccess(reader);
 installCanonicalTaskVisibility({active:()=>active(reader),read:(task,actor)=>typeof task.id==='string'&&access.getTask(actor,task.id)!==null,
 edit(task,actor){if(typeof task.id!=='string')return false;try{access.assertTaskCommand(actor,task.id,'update');return true;}catch(error){if(error instanceof Error&&[403,404].includes((error as any).status))return false;throw error;}},
 tagNames(ids,actor){return visibleTagLabels(reader,actor,ids);},
 tags(input,actor,persist){if(!hasTagOwnership(reader))return input as string[];const tx=ports.gateway.currentAppWriteTx(),source=tx??reader;assertTagSelection(source,actor,input);if(persist&&hasTagOwnership(source)){if(!tx)throw new Error('Legacy tag writes require the application gateway');for(const id of input as string[])if(!tx.get('SELECT id FROM productivity_tags WHERE id=?',id)){tx.run('INSERT INTO productivity_tags VALUES(?,?)',id,id);tx.run('INSERT INTO productivity_tag_owners VALUES(?,?)',id,actor.userId);}}return [...input as string[]];},
 create(actor){const permission=listPermission(reader,actor,'legacy-family');return actor.role===UserRole.ADMIN||actor.role===UserRole.CHILD||actor.role===UserRole.MEMBER&&(permission==='write'||permission==='manage');}});
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
 for(const legacy of tx.legacy.tasks){const row=byId.get(legacy.id);if(!row||!isDeepStrictEqual(row.legacy,legacy)||row.deletedAt!==null)throw new Error('Pilot source changed since preview');if(row.priority!==legacy.priority)throw new Error('Pilot priority differs from legacy source before activation');projection(row);}
 // Preserve current adult family behavior as once-only, revocable grants.
 for(const user of tx.legacy.users)if(!user.isDeleted&&user.role===UserRole.MEMBER)tx.run("INSERT OR IGNORE INTO productivity_list_grants(list_id,user_id,permission) VALUES(?,?,?)",'legacy-family',user.id,'manage');
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
  savePilotTask(tx,{...row,title:task.title,body:task.description,lifecycle,priority:task.priority===projection(row).priority?row.priority:task.priority,due,creatorId:task.creatorId,assigneeId:task.assigneeId,isShared:task.isShared,tagIds:[...task.tags],pendingApproval:task.pendingApproval??false,rewardPoints:task.rewardPoints??0,legacy:structuredClone(task),revision:row.revision+1});
 }
 for(const row of rows)if(row.deletedAt===null&&!seen.has(row.id))savePilotTask(tx,{...row,deletedAt:new Date().toISOString(),revision:row.revision+1});
 assertCurrentTaskTree(tx);
}
