import type {TaskApi} from './api.js';
import {assertTaskView,type TaskFilter,type TaskRecord} from './contracts.js';
import {classifyMatrix,type MatrixConfig} from './matrix.js';
/** Read-only unsaved-rule preview; all pages share the server's query clock/ACL. */
export async function previewMatrixRules(ports:Pick<TaskApi,'query'>,input:{config:MatrixConfig;filter:TaskFilter;timezone:string},options:{signal?:AbortSignal}={}){
 const captured=structuredClone(input);assertTaskView({id:'rule-preview',ownerId:'current-session',revision:0,kind:'matrix',config:captured.config,filter:captured.filter});options.signal?.throwIfAborted();
 let page=await ports.query({filter:captured.filter,timezone:captured.timezone},options),pages=0;const {queryId,clock,totalUnique}=page,rows:TaskRecord[]=[],ids=new Set<string>(),cursors=new Set<string>();
 if(clock.timezone!==captured.timezone||totalUnique>100000)throw Error('Invalid rule preview scope');
 for(;;){
  options.signal?.throwIfAborted();if(++pages>1024||page.queryId!==queryId||JSON.stringify(page.clock)!==JSON.stringify(clock)||page.totalUnique!==totalUnique)throw Error('Rule preview changed; reload.');
  for(const task of page.items){if(ids.has(task.id))throw Error('Duplicate rule preview task');ids.add(task.id);rows.push(task);}if(rows.length>totalUnique)throw Error('Invalid rule preview count');
  if(!page.nextCursor)break;if(!page.items.length||cursors.has(page.nextCursor))throw Error('Rule preview did not progress');cursors.add(page.nextCursor);page=await ports.query({queryId,cursor:page.nextCursor},options);
 }
 if(rows.length!==totalUnique)throw Error('Incomplete rule preview');return {clock:structuredClone(clock),projection:classifyMatrix(rows,captured.config,clock)};
}
