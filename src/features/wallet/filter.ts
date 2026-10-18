import type {RecordFilter,FilterRecord,CategoryNode,Money} from './contracts.js';
import {object,keys,strings,text,choice} from '../productivity/validation.js';
import {calendarDate} from '../productivity/dates.js';
import {assertPeriod} from './dates.js';
import {currencyExponent,minorInteger,assertMoney} from './money.js';
const kinds=['income','expense','transfer','adjustment','trade'] as const,statuses=['uncleared','cleared','reconciled','voided'] as const;
export function normalizeFilter(raw:unknown):RecordFilter {
 const f=object(raw);keys(f,['categoryMatch','uncategorized','unlabeled','period','accountIds','categoryIds','labelIds','labelMatch','currencies','kinds','statuses','paymentMethods','creatorIds','transferMode','query','absoluteMin','absoluteMax','referenceCurrency']);assertPeriod(f.period);currencyExponent(f.referenceCurrency as string);
 if(f.categoryMatch!==undefined)choice(f.categoryMatch,['exact','descendants']);
 const result={...f,period:{...f.period},labelMatch:f.labelMatch??'any',transferMode:f.transferMode??'include'} as RecordFilter;
 for(const field of ['accountIds','categoryIds','labelIds','currencies','kinds','statuses','paymentMethods','creatorIds'] as const)if(f[field]!==undefined){strings(f[field]);(result as any)[field]=[...new Set(f[field])];}
 for(const field of ['uncategorized','unlabeled'] as const)if(result[field]!==undefined&&result[field]!==true)throw new Error('Only explicit unassigned selection allowed');
 choice(result.labelMatch,['any','all']);choice(result.transferMode,['include','exclude','only']);
 for(const code of result.currencies??[])currencyExponent(code);for(const kind of result.kinds??[])choice(kind,kinds);for(const status of result.statuses??[])choice(status,statuses);
 if(result.query!==undefined)text(result.query,500,false);
 for(const bound of [result.absoluteMin,result.absoluteMax])if(bound!==undefined&&minorInteger(bound)<0n)throw new Error('Unsigned absolute filter bound required');
 if(result.absoluteMin!==undefined&&result.absoluteMax!==undefined&&minorInteger(result.absoluteMin)>minorInteger(result.absoluteMax))throw new Error('Invalid absolute amount range');return result;
}
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
/** Selection only, never authorization. Caller supplies already-authorized record/catalog projections. */
export function matchesRecordFilter(record:FilterRecord,raw:RecordFilter,categories:readonly CategoryNode[],referenceValue?:Money):boolean {
 const f=normalizeFilter(raw);calendarDate(record.effectiveDate);assertMoney({minor:record.minor,currency:record.currency});choice(record.kind,kinds);choice(record.status,statuses);
 if(record.effectiveDate<f.period.fromDate||record.effectiveDate>=f.period.toDateExclusive)return false;
 const facets:[string[]|undefined,string][]=[[f.currencies,record.currency],[f.kinds,record.kind],[f.statuses,record.status],[f.paymentMethods,record.paymentMethod],[f.creatorIds,record.creatorId]];
 if(facets.some(([values,value])=>values!==undefined&&!values.includes(value)))return false;
 if(f.accountIds!==undefined&&!f.accountIds.some(id=>record.accountIds.includes(id)))return false;
 if(f.labelIds!==undefined&&!(f.labelMatch==='all'?f.labelIds.length>0&&f.labelIds.every(id=>record.labelIds.includes(id)):f.labelIds.some(id=>record.labelIds.includes(id))))return false;
 if(f.uncategorized&&record.categoryId!==null||f.unlabeled&&record.labelIds.length>0)return false;
 if(f.categoryIds!==undefined){
  const parents=new Map(categories.map(c=>[c.id,c.parentId])),ancestors=new Set<string>();let id=record.categoryId;
  while(id!==null){if(ancestors.has(id))throw new Error('Category cycle');ancestors.add(id);id=f.categoryMatch==='exact'?null:parents.get(id)??null;}
  if(!f.categoryIds.some(id=>ancestors.has(id)))return false;
 }
 if(f.transferMode==='exclude'&&record.kind==='transfer'||f.transferMode==='only'&&record.kind!=='transfer')return false;
 if(f.query&&!normalized(record.searchText).includes(normalized(f.query.trim())))return false;
 if(f.absoluteMin!==undefined||f.absoluteMax!==undefined){
  const value=referenceValue??(record.currency===f.referenceCurrency?{minor:record.minor,currency:record.currency}:undefined);
  if(!value)throw new Error('Reference valuation unavailable');assertMoney(value);if(value.currency!==f.referenceCurrency)throw new Error('Reference currency mismatch');
  const n=minorInteger(value.minor),absolute=n<0n?-n:n;
  if(f.absoluteMin!==undefined&&absolute<minorInteger(f.absoluteMin)||f.absoluteMax!==undefined&&absolute>minorInteger(f.absoluteMax))return false;
 }
 return true;
}
