import type {TaskRecord,TaskFilter,QueryClock} from './contracts.js';
import {dueInstant,resolveDue,utcInstant,timezoneFormatter} from './dates.js';
import {object,keys,boolean,choice,strings,text} from './validation.js';
export function assertTaskFilter(value:unknown):asserts value is TaskFilter {
 const f=object(value);keys(f,['query','listIds','sectionIds','tagIds','tagMatch','assigneeIds','priority','lifecycle','overdue','rootsOnly','dueRange','includeTrash']);
 boolean(f.rootsOnly);
 for(const field of ['overdue','includeTrash'])if(f[field]!==undefined)boolean(f[field]);
 if(f.query!==undefined)text(f.query,500,false);
 for(const field of ['listIds','sectionIds','tagIds','assigneeIds','priority','lifecycle'])if(f[field]!==undefined)strings(f[field]);
 if(f.tagMatch!==undefined)choice(f.tagMatch,['any','all']);
 if(f.priority!==undefined)for(const item of f.priority as string[])choice(item,['high','medium','low','none']);
 if(f.lifecycle!==undefined)for(const item of f.lifecycle as string[])choice(item,['todo','in_progress','completed','wont_do']);
 if(f.dueRange!==undefined){const range=object(f.dueRange);keys(range,['from','toExclusive']);text(range.from,30);text(range.toExclusive,30);if(utcInstant(range.from)>=utcInstant(range.toExclusive))throw new Error('Invalid half-open range');}
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
/** Pure selection predicate for already-authorized tasks. This is NOT ACL. */
export function matchesFilter(task:TaskRecord,filter:TaskFilter,clock:QueryClock):boolean {
 assertTaskFilter(filter);utcInstant(clock.nowUtc);timezoneFormatter(clock.timezone);
 if(task.deletedAt&&!filter.includeTrash)return false;
 if(filter.rootsOnly&&task.parentId!==null)return false;
 const facets:[string[]|undefined,string|null][]=[[filter.listIds,task.listId],[filter.sectionIds,task.sectionId],[filter.assigneeIds,task.assigneeId],[filter.priority,task.priority],[filter.lifecycle,task.lifecycle]];
 if(facets.some(([options,value])=>options!==undefined&&(value===null||!options.includes(value))))return false;
 if(filter.tagIds!==undefined){if(filter.tagIds.length===0)return false;const has=(tag:string)=>task.tagIds.includes(tag);if(!(filter.tagMatch==='all'?filter.tagIds.every(has):filter.tagIds.some(has)))return false;}
 if(filter.query&&!normalize(`${task.title}\n${task.body}`).includes(normalize(filter.query.trim())))return false;
 if(filter.overdue!==undefined){const active=task.lifecycle!=='completed'&&task.lifecycle!=='wont_do';if((active&&resolveDue(task.due,clock).overdue)!==filter.overdue)return false;}
 if(filter.dueRange){const instant=dueInstant(task.due);if(instant===null||instant<utcInstant(filter.dueRange.from)||instant>=utcInstant(filter.dueRange.toExclusive))return false;}
 return true;
}
