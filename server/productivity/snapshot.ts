import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
import type {AppSnapshot} from '../snapshotValidation.js';
import {loadTask} from './store.js';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
export function exportProductivitySnapshot(tx:AppWriteTx):Record<string,unknown[]> {
 return Object.fromEntries(Object.entries(productivityTables).map(([name,columns])=>[name,tx.all(`SELECT ${columns.join(',')} FROM ${name}`)]));
}
/** Validate the same repository projection plus its native relationships before
 * the shared engine brands a snapshot or promotes any restore files.
 */
export function validateProductivitySnapshot(snapshot:AppSnapshot):void {
 const tables=snapshot.tables;
 if(!tables.productivity_tasks)return; // Registered but not migrated yet.
 const tasks=new Map(tables.productivity_tasks.map(row=>[row.id,row]));
 const lists=new Map(tables.productivity_lists.map(row=>[row.id,row]));
 const sections=new Map(tables.productivity_sections.map(row=>[row.id,row]));
 const tags=new Set(tables.productivity_tags.map(row=>row.id));
 const fail=()=>{throw new Error('Invalid productivity snapshot reference');};
 for(const row of tables.productivity_lists){text(row.id,256);text(row.title,500);text(row.owner_id,256);if(![0,1].includes(row.is_shared))fail();}
 for(const row of tables.productivity_sections){text(row.id,256);text(row.title,500);if(!lists.has(row.list_id))fail();}
 for(const row of tables.productivity_tags){text(row.id,256);text(row.name,256);}
 for(const row of tables.productivity_task_tags)if(!tasks.has(row.task_id)||!tags.has(row.tag_id))fail();
 const reader={get:(_sql:string,id:string)=>tasks.get(id),all:(_sql:string,id:string)=>tables.productivity_task_tags.filter(row=>row.task_id===id)} as unknown as AppWriteTx;
 for(const row of tables.productivity_tasks){
  if(!lists.has(row.list_id)||(row.parent_id!==null&&!tasks.has(row.parent_id))||(row.section_id!==null&&sections.get(row.section_id)?.list_id!==row.list_id))fail();
  choice(row.due_kind,['none','all_day','timed']);for(const key of ['is_shared','blocked','pending_approval'])if(![0,1].includes(row[key]))fail();
  loadTask(reader,row.id);
 }
 for(const row of tables.productivity_list_grants){if(!lists.has(row.list_id))fail();text(row.user_id,256);choice(row.permission,['read','write','manage']);}
 for(const row of tables.productivity_matrix_pins){if(!tasks.has(row.task_id))fail();text(row.view_id,256);choice(row.quadrant,['q1','q2','q3','q4']);}
 for(const row of tables.productivity_occurrences){if(!tasks.has(row.task_id))fail();text(row.id,256);text(row.series_id,256);text(row.occurrence_key,256);integer(row.ordinal);JSON.parse(row.payload_json);}
}
