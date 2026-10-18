import {AppStoreError} from '../appErrors.js';
import type {TaskReader} from './access.js';
/** Caller authorizes administrator access before resolving historical/trash IDs.
 * Read only linkage until the selected family is known; unrelated orphaned
 * history does not prevent conversion of a coherent family. */
export function legacyRecurrenceFamily(reader:TaskReader,id:string):{rootTaskId:string;taskIds:string[]} {
 const links=reader.all("SELECT id,json_extract(legacy_json,'$.sourceRecurringTaskId')AS source_id FROM productivity_tasks"),byId=new Map(links.map(row=>[row.id,row.source_id])),visited=new Set<string>();
 let root=id;
 while(true){if(!byId.has(root)||visited.has(root))throw new AppStoreError('Liên kết lịch lặp cũ bị thiếu hoặc tạo vòng.',422,'legacy-recurrence-family');visited.add(root);const parent=byId.get(root);if(parent===null||parent===undefined)break;if(typeof parent!=='string'||!parent)throw new AppStoreError('Liên kết lịch lặp cũ không hợp lệ.',422,'legacy-recurrence-family');root=parent;}
 const children=new Map<string,string[]>();for(const row of links)if(typeof row.source_id==='string'){const values=children.get(row.source_id)??[];values.push(row.id);children.set(row.source_id,values);}
 const taskIds=[root];for(let index=0;index<taskIds.length;index++){taskIds.push(...children.get(taskIds[index])??[]);if(taskIds.length>10000)throw new AppStoreError('Lịch lặp cũ vượt giới hạn nghiệm thu10000công việc.',422,'legacy-recurrence-family');}
 return {rootTaskId:root,taskIds:taskIds.sort()};
}
/** A legacy family must use controlled cutover even when a selected descendant
 * has no active recurrenceType; otherwise it can start a parallel generator. */
export function hasLegacyRecurrenceLineage(reader:TaskReader,id:string):boolean {
 return !!reader.get("SELECT id FROM productivity_tasks WHERE id=? AND json_extract(legacy_json,'$.sourceRecurringTaskId') IS NOT NULL UNION ALL SELECT id FROM productivity_tasks WHERE json_extract(legacy_json,'$.sourceRecurringTaskId')=? LIMIT 1",id,id);
}
