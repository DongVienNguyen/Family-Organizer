import type {RecordFilter} from './contracts.js';
import {normalizeFilter} from './filter.js';
import {parseMoney} from './money.js';
import {resolvePeriod,effectiveDateAt} from './dates.js';
export type RecordFacet='accountIds'|'categoryIds'|'labelIds'|'currencies'|'kinds'|'statuses'|'paymentMethods'|'creatorIds';
/** No selection means no restriction; an explicit empty server array means zero
 * matches, so the UI removes the dimension when its final checkbox is cleared. */
export function toggleRecordFacet(filter:RecordFilter,key:RecordFacet,id:string,selected:boolean):RecordFilter {
 const current=filter[key] as string[]|undefined,values=selected?[...new Set([...(current??[]),id])]:(current??[]).filter(value=>value!==id),next={...filter};
 if(values.length)(next as any)[key]=values;else delete next[key];return next;
}
export function recordFilterDraftInput(filter:RecordFilter,minimum:string,maximum:string,locale:string):RecordFilter {
 const value={...filter};delete value.absoluteMin;delete value.absoluteMax;
 if(minimum!=='')value.absoluteMin=parseMoney(minimum,value.referenceCurrency,locale).minor;
 if(maximum!=='')value.absoluteMax=parseMoney(maximum,value.referenceCurrency,locale).minor;
 return normalizeFilter(value);
}
export function presetRecordPeriod(filter:RecordFilter,kind:'week'|'month'|'year',instant:string):RecordFilter {
 return {...filter,period:resolvePeriod({kind,anchorDate:effectiveDateAt(instant,filter.period.timezone)},filter.period.timezone)};
}
