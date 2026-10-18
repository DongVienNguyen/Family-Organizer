import type {TaskQueryInput,TaskQueryPage} from './contracts.js';
export interface SearchHit {kind:'task'|'plan'|'note'|'transaction'|'document';id:string;title:string;snippet:string;date:string;tab:string}
/** Canonical task IDs replace the legacy task projection; other module ACL stays server-owned. */
export async function searchWithCanonicalTasks(ports:{legacy:(query:string,signal:AbortSignal)=>Promise<SearchHit[]>;canonical?:(input:TaskQueryInput,options:{signal:AbortSignal})=>Promise<TaskQueryPage>},query:string,signal:AbortSignal):Promise<SearchHit[]>{
 if(signal.aborted)throw new DOMException('Search aborted','AbortError');
 const [legacy,page]=await Promise.all([ports.legacy(query,signal),ports.canonical?ports.canonical({filter:{rootsOnly:false,query},timezone:'Asia/Saigon'},{signal}):null]);
 if(signal.aborted)throw new DOMException('Search aborted','AbortError');
 if(!page)return legacy;
 const tasks:SearchHit[]=page.items.slice(0,20).map(task=>({kind:'task',id:task.id,title:task.title,snippet:task.body.slice(0,120),date:task.due.kind==='none'?'':task.due.kind==='all_day'?task.due.date:task.due.instantUtc,tab:'tasks'}));
 return [...tasks,...legacy.filter(row=>row.kind!=='task')].slice(0,50);
}
