import type {AppWriteTx} from '../appStore.js';
import type {AppSnapshot} from '../snapshotValidation.js';
import {decodeTaskRow,projectLegacyTask} from './store.js';
import {productivityTablesAt} from './structureSchema.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {isDeepStrictEqual} from 'node:util';
import {requireCanonicalReader} from './bridgeState.js';
import {assertTaskTree,edge} from './structureInvariant.js';
export function exportProductivitySnapshot(tx:AppWriteTx):Record<string,unknown[]> {
 return Object.fromEntries(Object.entries(productivityTablesAt(tx.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'")?.version??1)).map(([name,columns])=>[name,tx.all(`SELECT ${columns.join(',')} FROM ${name}`)]));
}
/** Validate the same repository projection plus its native relationships before
 * the shared engine brands a snapshot or promotes any restore files.
 */
export function validateProductivitySnapshot(snapshot:AppSnapshot):void {
 if(snapshot.tables.app_meta.some(row=>row.key==='productivity_active'&&row.value==='1'))requireCanonicalReader();
 validateProductivitySnapshotData(snapshot);
}
/** Pure semantic inspection never authorizes promotion or installs a reader. */
export function validateProductivitySnapshotData(snapshot:AppSnapshot):void {
 const tables=snapshot.tables;
 const marker=tables.app_meta.find(row=>row.key==='productivity_active')?.value;
 if(marker!==undefined&&marker!=='1')throw new Error('Unsupported canonical task snapshot marker');
 if(!tables.productivity_tasks){if(marker==='1')throw new Error('Active task snapshot is missing canonical tables');return;}
 const tasks=new Map(tables.productivity_tasks.map(row=>[row.id,row]));
 const lists=new Map(tables.productivity_lists.map(row=>[row.id,row]));
 const sections=new Map(tables.productivity_sections.map(row=>[row.id,row]));
 const tags=new Set(tables.productivity_tags.map(row=>row.id));
 const fail=()=>{throw new Error('Invalid productivity snapshot reference');};
 for(const row of tables.productivity_lists){text(row.id,256);text(row.title,500);text(row.owner_id,256);if(![0,1].includes(row.is_shared))fail();}
 for(const row of tables.productivity_sections){text(row.id,256);text(row.title,500);if(!lists.has(row.list_id))fail();}
 for(const row of tables.productivity_tags){text(row.id,256);text(row.name,256);}
 const tagRows=new Map<string,string[]>();
 for(const row of tables.productivity_task_tags){if(!tasks.has(row.task_id)||!tags.has(row.tag_id))fail();const values=tagRows.get(row.task_id)??[];values.push(row.tag_id);tagRows.set(row.task_id,values);}
 for(const row of tables.productivity_tasks){
  if(!lists.has(row.list_id)||(row.parent_id!==null&&!tasks.has(row.parent_id))||(row.section_id!==null&&sections.get(row.section_id)?.list_id!==row.list_id))fail();
  choice(row.due_kind,['none','all_day','timed']);for(const key of ['is_shared','blocked','pending_approval'])if(![0,1].includes(row[key]))fail();
  decodeTaskRow(row,tagRows.get(row.id)??[]);
 }
 for(const row of tables.productivity_list_grants){if(!lists.has(row.list_id))fail();text(row.user_id,256);choice(row.permission,['read','write','manage']);}
 for(const row of tables.productivity_matrix_pins){if(!tasks.has(row.task_id))fail();text(row.view_id,256);choice(row.quadrant,['q1','q2','q3','q4']);}
 for(const row of tables.productivity_occurrences){if(!tasks.has(row.task_id))fail();text(row.id,256);text(row.series_id,256);text(row.occurrence_key,256);integer(row.ordinal);JSON.parse(row.payload_json);}
 if(snapshot.manifest.domains.productivity>=2){
  assertTaskTree(tables.productivity_tasks.map(edge));
  if(!tables.productivity_catalog_revisions||!tables.productivity_check_items)fail();
  for(const row of tables.productivity_catalog_revisions){choice(row.entity_kind,['list','section','tag']);text(row.entity_id,256);integer(row.revision,1);if(row.archived_at!==null){text(row.archived_at,30);utcInstant(row.archived_at);}if(!(row.entity_kind==='list'?lists.has(row.entity_id):row.entity_kind==='section'?sections.has(row.entity_id):tags.has(row.entity_id)))fail();}
  const ranks=new Set<string>();
  for(const row of tables.productivity_check_items){text(row.id,256);text(row.text,2000);integer(row.rank);if(!tasks.has(row.task_id)||![0,1].includes(row.is_done))fail();const key=JSON.stringify([row.task_id,row.rank]);if(ranks.has(key))fail();ranks.add(key);}
 }
 if(snapshot.manifest.domains.productivity>=3){if(!tables.productivity_tag_owners)fail();const users=new Set(snapshot.legacy.users.map(user=>user.id));for(const row of tables.productivity_tag_owners){text(row.tag_id,256);text(row.user_id,256);if(!tags.has(row.tag_id)||!users.has(row.user_id))fail();}}
 if(snapshot.manifest.domains.productivity>=4){if(!tables.productivity_task_pins)fail();const users=new Set(snapshot.legacy.users.map(user=>user.id));for(const row of tables.productivity_task_pins){text(row.task_id,256);text(row.user_id,256);integer(row.revision,1);if(!tasks.has(row.task_id)||!users.has(row.user_id)||![0,1].includes(row.is_pinned))fail();}}
 if(marker==='1'){
  const order=(a:string,b:string)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
  const projected=[...tasks.values()].filter(row=>row.deleted_at===null).sort((a,b)=>a.rank-b.rank||order(a.id,b.id)).map(row=>projectLegacyTask(decodeTaskRow(row,(tagRows.get(row.id)??[]).sort(order))));
  if(!isDeepStrictEqual(snapshot.legacy.tasks,projected))throw new Error('Canonical task snapshot legacy projection mismatch');
 }
}
