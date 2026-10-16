import type {BoardPage,GroupedBoardPage} from './boardClient.js';
const fail=():never=>{throw Error('Kanban snapshot changed; reload the board');};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const unique=(values:string[])=>{if(new Set(values).size!==values.length)fail();};
/** Combine validated transport pages from one actor-owned in-memory read.
 * Never mix clocks/revisions/views or infer missing cards from global counts. */
function agreement(a:BoardPage|GroupedBoardPage,b:BoardPage|GroupedBoardPage,cursor:string){
 if(!a.nextCursor||cursor!==a.nextCursor||b.nextCursor===cursor)fail();
 for(const key of ['viewId','viewRevision','boardId','boardRevision','totalUnique','clock']as const)if(!same(a[key],b[key]))fail();
 const columns=(p:BoardPage|GroupedBoardPage)=>p.columns.map(c=>{const {cards,...rest}=c as any;return rest;});if(!same(columns(a),columns(b)))fail();
}
function coverage(columns:{visibleCardCount:number}[],counts:number[],total:number,nextCursor:string|null){
 const wanted=columns.reduce((n,c)=>n+c.visibleCardCount,0),loaded=counts.reduce((n,c)=>n+c,0);if(loaded>wanted||counts.some((n,i)=>n>columns[i].visibleCardCount)||nextCursor===null&&loaded!==wanted||nextCursor!==null&&loaded===wanted||total>5000)fail();
}
export function appendCanonicalBoardPage(previous:BoardPage,incoming:BoardPage,requestedCursor:string):BoardPage {
 agreement(previous,incoming,requestedCursor);if(previous.mode!==incoming.mode)fail();const result=structuredClone({...previous,nextCursor:incoming.nextCursor,columns:previous.columns.map((c,i)=>({...c,cards:[...c.cards,...incoming.columns[i].cards]}))}),ids=result.columns.flatMap(c=>c.cards.map(card=>card.task.id));unique(ids);if(ids.length>5000)fail();coverage(result.columns,result.columns.map(c=>c.cards.length),result.totalUnique,result.nextCursor);if(result.nextCursor===null&&ids.length!==result.totalUnique)fail();return result;
}
export function appendGroupedBoardPage(previous:GroupedBoardPage,incoming:GroupedBoardPage,requestedCursor:string):GroupedBoardPage {
 agreement(previous,incoming,requestedCursor);if(previous.group!==incoming.group)fail();const tasks=new Map(previous.tasks.map(t=>[t.id,t]));for(const t of incoming.tasks){const prior=tasks.get(t.id);if(prior&&!same(prior,t))fail();tasks.set(t.id,t);}
 const result=structuredClone({...previous,nextCursor:incoming.nextCursor,tasks:[...tasks.values()],cards:[...previous.cards,...incoming.cards]});unique(result.cards.map(c=>c.projectionId));unique(result.cards.map(c=>JSON.stringify([c.taskId,c.group])));if(result.cards.length>20000||tasks.size>result.totalUnique)fail();
 const counts=result.columns.map(c=>result.cards.filter(card=>same(card.group,c.group)).length),used=new Set(result.cards.map(c=>c.taskId));if(used.size!==tasks.size||[...used].some(id=>!tasks.has(id)))fail();coverage(result.columns,counts,result.totalUnique,result.nextCursor);if(result.nextCursor===null&&tasks.size!==result.totalUnique)fail();return result;
}
