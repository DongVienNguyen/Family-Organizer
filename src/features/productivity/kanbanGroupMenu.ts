import type {GroupedBoardPage} from './boardClient.js';
import type {GroupMoveIntent} from './groupMove.js';
import {groupMovePatch} from './groupMove.js';
import {object,keys,text,choice} from './validation.js';
export type KanbanGroupSource=GroupedBoardPage['columns'][number]['group'];
export interface KanbanGroupTarget {value:string|null;allTags?:'add'|'replace'}
/** Form intent only. The existing owner/client/server still authorize, preview,
 * bind revisions and apply; this never mutates Task or projection facts. */
export function groupMenuIntent(page:GroupedBoardPage,taskId:string,source:KanbanGroupSource,target:KanbanGroupTarget):GroupMoveIntent {
 const input=object(target);keys(input,['value','allTags']);if(input.value!==null)text(input.value,256);keys(object(source),['kind','value']);
 const task=page.tasks.find(row=>row.id===taskId);if(!task||source.kind!==page.group||!page.cards.some(card=>card.taskId===taskId&&card.group.kind===source.kind&&card.group.value===source.value))throw Error('VISIBLE_GROUP_SOURCE_REQUIRED');
 if(source.kind!=='tag'&&Object.hasOwn(input,'allTags'))throw Error('EXPLICIT_TAG_SCOPE_ONLY');
 let intent:GroupMoveIntent;
 if(source.kind==='priority'){choice(input.value,['high','medium','low','none']);intent={kind:'priority',value:input.value};}
 else if(source.kind==='assignee')intent={kind:'assignee',value:input.value as string|null};
 else if(source.kind==='due')intent={kind:'due',value:input.value===null?{kind:'none'}:{kind:'all_day',date:input.value as string,timezone:page.clock.timezone}};
 else{if(Object.hasOwn(input,'allTags')){choice(input.allTags,['add','replace']);intent={kind:'tag',source:{all:true},target:input.value as string|null,choice:input.allTags};}else intent={kind:'tag',source:source.value,target:input.value as string|null};}
 const patch=groupMovePatch(task,intent);if(intent.kind==='tag'&&intent.target===null&&patch.tagIds!.length>0)throw Error('EXPLICIT_ALL_TAGS_REPLACEMENT_REQUIRED');return structuredClone(intent);
}
