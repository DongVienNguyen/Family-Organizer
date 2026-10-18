import type {TaskRecord,TaskFilter,QueryClock} from './contracts.js';
import {dueInstant,resolveDue,utcInstant,timezoneFormatter,localDateAt,calendarDate,localDayStart} from './dates.js';
import {object,keys,boolean,choice,strings,text} from './validation.js';
export function assertTaskFilter(value:unknown):asserts value is TaskFilter {
 const f=object(value);keys(f,['query','listIds','sectionIds','tagIds','tagMatch','assigneeIds','priority','lifecycle','overdue','rootsOnly','dueRange','includeTrash','trashOnly','dueKinds','completedWindowDays']);
 boolean(f.rootsOnly);
 for(const field of ['overdue','includeTrash','trashOnly'])if(f[field]!==undefined)boolean(f[field]);
 if(f.trashOnly===true&&f.includeTrash!==true)throw new Error('Trash view requires includeTrash');
 if(f.dueKinds!==undefined){strings(f.dueKinds);for(const kind of f.dueKinds as string[])choice(kind,['none','all_day','timed']);}
 if(f.completedWindowDays!==undefined&&f.completedWindowDays!=='all'&&![7,30,90].includes(f.completedWindowDays as number))throw new Error('Invalid completed window');
 if(f.query!==undefined)text(f.query,500,false);
 for(const field of ['listIds','sectionIds','tagIds','assigneeIds','priority','lifecycle'])if(f[field]!==undefined)strings(f[field]);
 if(f.tagMatch!==undefined)choice(f.tagMatch,['any','all']);
 if(f.priority!==undefined)for(const item of f.priority as string[])choice(item,['high','medium','low','none']);
 if(f.lifecycle!==undefined)for(const item of f.lifecycle as string[])choice(item,['todo','in_progress','completed','wont_do']);
 if(f.dueRange!==undefined){const range=object(f.dueRange);keys(range,['from','toExclusive']);text(range.from,30);text(range.toExclusive,30);if(utcInstant(range.from)>=utcInstant(range.toExclusive))throw new Error('Invalid half-open range');}
}
export const normalizeTaskSearchText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
/** Pure selection predicate for already-authorized tasks. This is NOT ACL. */
export function matchesFilter(task:TaskRecord,filter:TaskFilter,clock:QueryClock):boolean {
 assertTaskFilter(filter);utcInstant(clock.nowUtc);timezoneFormatter(clock.timezone);
 if(task.deletedAt&&!filter.includeTrash)return false;
 if(filter.trashOnly!==undefined&&!!task.deletedAt!==filter.trashOnly)return false;
 if(filter.dueKinds!==undefined&&!filter.dueKinds.includes(task.due.kind))return false;
 if(filter.completedWindowDays!==undefined){if(task.lifecycle!=='completed')return false;if(filter.completedWindowDays!=='all'){if(!task.completedReferenceAt)return false;const today=localDateAt(utcInstant(clock.nowUtc),clock.timezone),fromDate=new Date(calendarDate(today)-filter.completedWindowDays*86400000).toISOString().slice(0,10),reference=utcInstant(task.completedReferenceAt);if(reference<localDayStart(fromDate,clock.timezone)||reference>utcInstant(clock.nowUtc))return false;}}
 if(filter.rootsOnly&&task.parentId!==null)return false;
 const facets:[string[]|undefined,string|null][]=[[filter.listIds,task.listId],[filter.sectionIds,task.sectionId],[filter.assigneeIds,task.assigneeId],[filter.priority,task.priority],[filter.lifecycle,task.lifecycle]];
 if(facets.some(([options,value])=>options!==undefined&&(value===null||!options.includes(value))))return false;
 if(filter.tagIds!==undefined){if(filter.tagIds.length===0)return false;const has=(tag:string)=>task.tagIds.includes(tag);if(!(filter.tagMatch==='all'?filter.tagIds.every(has):filter.tagIds.some(has)))return false;}
 if(filter.query&&!normalizeTaskSearchText(`${task.title}\n${task.body}`).includes(normalizeTaskSearchText(filter.query.trim())))return false;
 if(filter.overdue!==undefined){const active=task.lifecycle!=='completed'&&task.lifecycle!=='wont_do';if((active&&resolveDue(task.due,clock).overdue)!==filter.overdue)return false;}
 if(filter.dueRange){const instant=dueInstant(task.due);if(instant===null||instant<utcInstant(filter.dueRange.from)||instant>=utcInstant(filter.dueRange.toExclusive))return false;}
 return true;
}
