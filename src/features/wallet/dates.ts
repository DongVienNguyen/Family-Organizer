import type {Period} from './contracts.js';
import {calendarDate,localDateAt,utcInstant,timezoneFormatter} from '../productivity/dates.js';
import {object,keys,choice} from '../productivity/validation.js';
export function parseEffectiveDate(value:string,format:'YYYY-MM-DD'|'DD/MM/YYYY'|'MM/DD/YYYY'='YYYY-MM-DD'):string {
 let date=value;
 if(format!=='YYYY-MM-DD'){
  if(!['DD/MM/YYYY','MM/DD/YYYY'].includes(format)||typeof value!=='string'||!/^\d{2}\/\d{2}\/\d{4}$/.test(value))throw new Error('Explicit date format required');
  const [first,second,year]=value.split('/');date=format==='DD/MM/YYYY'?`${year}-${second}-${first}`:`${year}-${first}-${second}`;
 }
 calendarDate(date);return date;
}
export function effectiveDateAt(instantUtc:string,timezone:string):string {return localDateAt(utcInstant(instantUtc),timezone);}
export function assertPeriod(value:unknown):asserts value is Period {
 const p=object(value);keys(p,['fromDate','toDateExclusive','timezone']);timezoneFormatter(p.timezone as string);
 if(calendarDate(p.fromDate as string)>=calendarDate(p.toDateExclusive as string))throw new Error('Invalid half-open period');
}
export function resolvePeriod(input:{kind:'week'|'month'|'year'|'custom';anchorDate:string;fromDate?:string;toDateExclusive?:string},timezone:string):Period {
 const raw=object(input);keys(raw,['kind','anchorDate','fromDate','toDateExclusive']);choice(raw.kind,['week','month','year','custom']);
 const anchor=calendarDate(input.anchorDate);timezoneFormatter(timezone);const date=new Date(anchor),year=date.getUTCFullYear(),month=date.getUTCMonth();
 let fromDate:string,toDateExclusive:string;
 const iso=(n:number)=>{const value=new Date(n).toISOString().slice(0,10);calendarDate(value);return value;};
 switch(input.kind){
  case 'week':{const monday=anchor-((date.getUTCDay()+6)%7)*86_400_000;fromDate=iso(monday);toDateExclusive=iso(monday+7*86_400_000);break;}
  case 'month':fromDate=iso(Date.UTC(year,month,1));toDateExclusive=iso(Date.UTC(year,month+1,1));break;
  case 'year':fromDate=iso(Date.UTC(year,0,1));toDateExclusive=iso(Date.UTC(year+1,0,1));break;
  case 'custom':fromDate=input.fromDate!;toDateExclusive=input.toDateExclusive!;break;
 }
 const period={fromDate,toDateExclusive,timezone};assertPeriod(period);return period;
}
