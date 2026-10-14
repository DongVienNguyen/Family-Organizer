import {taskPinTables,taskPinSchemaSql,migrateTaskPins} from './pinSchema.js';
import {tagOwnershipTables,tagOwnershipSchemaSql,migrateTagOwnership} from './tagSchema.js';
import type {AppWriteTx} from '../appStore.js';
import type {Task} from '../../src/types.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable,registerSnapshotValidator} from '../appSnapshot.js';
import {schemaSql,preparePilotSchema,productivityTables} from './schema.js';
import {parseLegacyDue} from '../../src/features/productivity/dates.js';
import {savePilotTask,loadTask,type StoredTask} from './store.js';
import {createHash} from 'node:crypto';
import {assertLegacyTask} from './legacy.js';
import {validateProductivitySnapshot} from './snapshot.js';
import {structureSchemaSql,structureTables,migrateStructure} from './structureSchema.js';
export interface MigrationReport {version:number;inserted:number;existing:number;warnings:{taskId:string;rawDue:string;warnings:string[]}[]}
export function migrateTasks(tx:AppWriteTx,legacy:Task[]):MigrationReport {
 preparePilotSchema(tx);
 tx.run('INSERT OR IGNORE INTO productivity_lists(id,title,owner_id,is_shared) VALUES(?,?,?,?)','legacy-family','Gia đình','system:migration',1);
 const report:MigrationReport={version:1,inserted:0,existing:0,warnings:[]};const seen=new Set<string>();
 for(const [index,old] of legacy.entries()){
  assertLegacyTask(old);
  if(seen.has(old.id))throw new Error('Duplicate legacy task ID');seen.add(old.id);
  if(loadTask(tx,old.id)){report.existing++;continue;}
  const parsed=parseLegacyDue(old.dueDate,'Asia/Saigon'),warnings=[...parsed.warnings];
  let lifecycle:StoredTask['lifecycle'];
  if(old.status==='overdue'){
   const transition=/^(?:Đã thay đổi|Cập nhật): trạng thái từ '(?:todo|in_progress|completed|overdue)' thành '(todo|in_progress|completed)'(?:$|, )/;
   const latest=[...old.history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).find(row=>transition.test(row.action));
   const prior=latest?.action.match(transition)?.[1];
   lifecycle=prior==='in_progress'?'in_progress':'todo';warnings.push(prior==='in_progress'?'Legacy overdue mapped in_progress from explicit history':'Legacy overdue mapped todo; prior active state unproven');
  }else if(old.status==='todo'||old.status==='in_progress'||old.status==='completed')lifecycle=old.status;
  else throw new Error('Unsupported legacy task status');
  const row:StoredTask={id:old.id,listId:'legacy-family',sectionId:null,parentId:null,title:old.title,body:old.description,lifecycle,priority:old.priority,due:parsed.due,scheduledStart:null,scheduledEnd:null,creatorId:old.creatorId,assigneeId:old.assigneeId,isShared:old.isShared,tagIds:[...new Set(old.tags)],blocked:false,blockedReason:null,pendingApproval:old.pendingApproval??false,rewardPoints:old.rewardPoints??0,revision:1,deletedAt:null,legacy:structuredClone(old),rank:(index+1)*1024};
  savePilotTask(tx,row);report.inserted++;if(warnings.length)report.warnings.push({taskId:old.id,rawDue:old.dueDate,warnings});
 }
 return report;
}
export const productivityMigrationChecksum=createHash('sha256').update(schemaSql+'\nlegacy-task-map-v1-synthetic-pilot-saigon-raw-provenance').digest('hex');
export const productivityStructureChecksum=createHash('sha256').update(structureSchemaSql+'\nstructure-catalog-check-items-v2').digest('hex');
export const productivityTagChecksum=createHash('sha256').update(tagOwnershipSchemaSql+'\ntag-owner-label-compat-v3').digest('hex');
export const productivityPinChecksum=createHash('sha256').update(taskPinSchemaSql+'\npersonal-task-pins-v4').digest('hex');
const apply=(tx:AppWriteTx)=>{migrateTasks(tx,tx.legacy.tasks);};
/** Explicit I01 ports prevent imports from opening storage or registering jobs. */
export function registerProductivityMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable;registerValidator:typeof registerSnapshotValidator}):void {
 for(const [name,columns] of Object.entries({...productivityTables,...structureTables,...tagOwnershipTables,...taskPinTables}))ports.registerSnapshot('productivity',name,columns);
 ports.registerMigration('productivity',1,apply,productivityMigrationChecksum);
 ports.registerMigration('productivity',2,migrateStructure,productivityStructureChecksum);
 ports.registerMigration('productivity',3,migrateTagOwnership,productivityTagChecksum);
 ports.registerMigration('productivity',4,migrateTaskPins,productivityPinChecksum);
 ports.registerValidator('productivity',validateProductivitySnapshot);
}
