import type {SharedBoardConfig,BoardPolicyInput} from '../../../server/productivity/boardCatalog.js';
import {object,keys,text,integer,choice} from './validation.js';
export type BoardPolicy=SharedBoardConfig;
export type ColumnPolicy=BoardPolicyInput;
type Read=(path:string,method?:string,body?:unknown,requestId?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
const fail=():never=>{throw Error('Inconsistent board policy metadata');};
function policy(value:unknown){const p=object(value);keys(p,['policy','limit']);choice(p.policy,['off','soft','hard']);if(p.policy==='off'){if(p.limit!==null)fail();}else integer(p.limit,1);}
export function boardPolicyDraft(board:BoardPolicy,values:ColumnPolicy[]):void{
 if(!Array.isArray(values)||values.length>1000)fail();const seen=new Set<string>();
 for(const value of values){const p=object(value);keys(p,['columnKey','policy','limit']);text(p.columnKey,264);policy({policy:p.policy,limit:p.limit});if(seen.has(p.columnKey as string)||!board.columns.some(c=>c.columnKey===p.columnKey))fail();seen.add(p.columnKey as string);}
}
export function decodeBoardPolicy(value:unknown,id:string):BoardPolicy{
 const b=object(value);keys(b,['id','listId','mode','revision','columns']);text(b.id,256);text(b.listId,256);choice(b.mode,['sections','workflow']);integer(b.revision,1);if(b.id!==id||!Array.isArray(b.columns)||b.columns.length<1||b.columns.length>1000)fail();
 const ids=new Set<string>(),names=new Set<string>();let rank=-1;
 for(const value of b.columns as unknown[]){const c=object(value);keys(c,['id','columnKey','sectionId','rank','revision','wip']);text(c.id,256);text(c.columnKey,264);integer(c.rank);integer(c.revision,1);policy(c.wip);if(ids.has(c.id as string)||names.has(c.columnKey as string)||(c.rank as number)<rank)fail();rank=c.rank as number;ids.add(c.id as string);names.add(c.columnKey as string);
  if(b.mode==='workflow'){if(c.sectionId!==null||!['todo','doing','waiting','review','done','wont_do','trash'].includes(c.columnKey as string))fail();}
  else if(c.sectionId===null){if(c.columnKey!=='none')fail();}else{text(c.sectionId,256);if(c.columnKey!=='section:'+c.sectionId)fail();}
 }
 return structuredClone(b)as unknown as BoardPolicy;
}
/** Internal session transport; writes are explicit and never automatically retried. */
export function createBoardPolicyApi(read:Read){return {
 async boardPolicy(id:string,options:{signal?:AbortSignal}={}):Promise<BoardPolicy>{text(id,256);return decodeBoardPolicy((await read('/api/productivity/boards/'+encodeURIComponent(id)+'/policy','GET',undefined,undefined,options.signal)).board,id);},
 async configureBoardPolicy(before:BoardPolicy,policies:ColumnPolicy[],requestId:string):Promise<BoardPolicy>{
  decodeBoardPolicy(before,before.id);boardPolicyDraft(before,policies);const next=decodeBoardPolicy((await read('/api/productivity/boards/configure','POST',{expectedRevision:before.revision,input:{listId:before.listId,mode:before.mode,policies}},requestId)).board,before.id);
  if(next.listId!==before.listId||next.mode!==before.mode||next.revision!==before.revision+1||next.columns.length!==before.columns.length)fail();
  for(const old of before.columns){const c=next.columns.find(c=>c.id===old.id),selected=policies.find(p=>p.columnKey===old.columnKey),wip=selected??old.wip;if(!c||c.columnKey!==old.columnKey||c.sectionId!==old.sectionId||c.rank!==old.rank||c.revision!==old.revision+1||c.wip.policy!==wip.policy||c.wip.limit!==wip.limit)fail();}
  return next;
 }
};}
