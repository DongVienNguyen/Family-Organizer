import {object,keys,text,integer,choice,boolean} from '../productivity/validation.js';
import type {BulkSelection,BulkResult} from '../../../server/wallet/bulk.js';
import type {SelectionSummary} from '../../../server/wallet/selections.js';
function timestamp(value:unknown):string {
    text(value,24);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Invalid selection time');
    return value;
}
export function selectionValue(raw:unknown):SelectionSummary {
    const value=object(raw);
    keys(value,['id','count','revision','state','sourceKind','createdAt','expiresAt']);
    text(value.id,256);
    integer(value.count,0,100000);
    integer(value.revision,1,2);
    choice(value.state,['ready','applied']);
    choice(value.sourceKind,['filter','ids']);
    if(value.revision!==(value.state==='ready'?1:2))throw Error('Selection state revision');
    const createdAt=timestamp(value.createdAt),expiresAt=timestamp(value.expiresAt),duration=Date.parse(expiresAt)-Date.parse(createdAt);
    if(duration<=0||duration>86400000)throw Error('Selection expiry');
    return {id:value.id,count:value.count,revision:value.revision,state:value.state,sourceKind:value.sourceKind,createdAt,expiresAt};
}
export function bulkResultValue(raw:unknown,selection?:BulkSelection):BulkResult {
    const value=object(raw);
    keys(value,['matched','updated','unchanged','selectionId','selectionRevision']);
    integer(value.matched,0,100000);
    integer(value.updated,0,100000);
    integer(value.unchanged,0,100000);
    if(value.updated+value.unchanged!==value.matched)throw Error('Bulk acknowledgement counts');
    if(selection&&'ids' in selection&&value.matched!==selection.ids.length)throw Error('Bulk direct selection coverage');
    const result:BulkResult={matched:value.matched,updated:value.updated,unchanged:value.unchanged};
    if(selection&&'selectionId' in selection){
        if(value.selectionId!==selection.selectionId||value.selectionRevision!==2)throw Error('Bulk selection identity');
        result.selectionId=value.selectionId;
        result.selectionRevision=2;
    }else if(value.selectionId!==undefined||value.selectionRevision!==undefined)throw Error('Unexpected bulk selection');
    return result;
}
function state(raw:unknown){
    const value=object(raw);
    keys(value,['revision','categoryId','settlementStatus','note','payee','labelIds','noteTruncated']);
    integer(value.revision,1);
    if(value.categoryId!==null)text(value.categoryId,256);
    choice(value.settlementStatus,['uncleared','cleared','reconciled']);
    text(value.note,1000,false);
    text(value.payee,500,false);
    boolean(value.noteTruncated);
    if(!Array.isArray(value.labelIds)||value.labelIds.length>20||new Set(value.labelIds).size!==value.labelIds.length)throw Error('Bulk preview labels');
    for(const id of value.labelIds)text(id,256);
    return {revision:value.revision,categoryId:value.categoryId as string|null,settlementStatus:value.settlementStatus,note:value.note,payee:value.payee,labelIds:[...value.labelIds] as string[],noteTruncated:value.noteTruncated};
}
export function bulkPreviewValue(raw:unknown,selection?:BulkSelection){
    const value=object(raw);
    keys(value,['matched','updated','unchanged','intentHash','samples']);
    const counts=bulkResultValue({matched:value.matched,updated:value.updated,unchanged:value.unchanged});
    if(typeof value.intentHash!=='string'||!/^[a-f0-9]{64}$/.test(value.intentHash)||!Array.isArray(value.samples)||value.samples.length!==Math.min(counts.updated,5))throw Error('Bulk preview coverage');
    const samples=value.samples.map(input=>{
        const row=object(input);
        keys(row,['id','before','after']);
        text(row.id,256);
        const before=state(row.before),after=state(row.after);
        if(after.revision!==before.revision+1)throw Error('Bulk preview revision');
        return {id:row.id,before,after};
    });
    if(selection&&'ids' in selection&&(counts.matched!==selection.ids.length||samples.some(row=>!selection.ids.includes(row.id)||row.before.revision!==selection.revisions[row.id])))throw Error('Bulk preview direct identity');
    if(new Set(samples.map(row=>row.id)).size!==samples.length)throw Error('Duplicate bulk sample');
    return {...counts,intentHash:value.intentHash,samples};
}
