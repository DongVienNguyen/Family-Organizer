import {object,keys,text,integer} from '../productivity/validation.js';
import {minorInteger} from './money.js';
export interface AllocationDraft {categoryId:string;amountMinor:string}
/** An empty list removes a split. Populated rows exactly replace one posting's
 * category distribution; they never add a second ledger amount. */
export function allocationRows(raw:unknown):AllocationDraft[]{
 if(!Array.isArray(raw)||raw.length>100)throw Error('Invalid allocation count');const seen=new Set<string>();return raw.map(value=>{const row=object(value);keys(row,['categoryId','amountMinor']);text(row.categoryId,256);if(seen.has(row.categoryId)||minorInteger(row.amountMinor)<=0n)throw Error('Invalid allocation row');seen.add(row.categoryId);return {categoryId:row.categoryId,amountMinor:row.amountMinor as string};}).sort((a,b)=>a.categoryId<b.categoryId?-1:a.categoryId>b.categoryId?1:0);
}
export function assertAllocationTotal(rows:AllocationDraft[],record:{kind:string},postings:{deltaMinor:string}[]):void {
 if(!rows.length)return;if(!['income','expense'].includes(record.kind)||postings.length!==1)throw Error('Split requires one income/expense posting');const amount=minorInteger(postings[0].deltaMinor);if(record.kind==='income'?amount<=0n:amount>=0n)throw Error('Invalid split posting');const total=rows.reduce((sum,row)=>sum+minorInteger(row.amountMinor),0n);if(total!==(amount<0n?-amount:amount))throw Error('Split total mismatch');
}

export function allocationResultValue(raw:unknown,id:string,expectedRevision?:number){const value=object(raw);keys(value,['recordId','revision','rows']);if(value.recordId!==id)throw Error('Allocation identity');integer(value.revision,1);if(expectedRevision!==undefined&&value.revision!==expectedRevision&&value.revision!==expectedRevision+1)throw Error('Allocation revision');return {recordId:id,revision:value.revision,rows:allocationRows(value.rows)};}
