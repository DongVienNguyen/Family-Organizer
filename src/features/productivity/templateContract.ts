import type {Priority} from './contracts.js';
import {object,keys,text,choice,integer} from './validation.js';
import {utcInstant} from './dates.js';
export interface TaskTemplatePayload {title:string;body:string;priority:Priority;checklist:string[]}
export interface TaskTemplate {id:string;sourceTaskId:string;sourceRevision:number;revision:number;payload:TaskTemplatePayload;createdAt:string;updatedAt:string}
export interface InstantiateTemplateInput {listId:string;expectedListRevision:number}
export function templatePayload(raw:unknown):TaskTemplatePayload {
 const value=object(raw);keys(value,['title','body','priority','checklist']);text(value.title,500);text(value.body,100000,false);choice(value.priority,['high','medium','low','none']);if(!Array.isArray(value.checklist)||value.checklist.length>200)throw Error('Invalid template checklist');for(const item of value.checklist)text(item,2000);return structuredClone(value)as unknown as TaskTemplatePayload;
}
export function taskTemplateValue(raw:unknown):TaskTemplate {
 const value=object(raw);keys(value,['id','sourceTaskId','sourceRevision','revision','payload','createdAt','updatedAt']);text(value.id,256);text(value.sourceTaskId,256);integer(value.sourceRevision,1);integer(value.revision,1);if(utcInstant(value.updatedAt as string)<utcInstant(value.createdAt as string))throw Error('Invalid template timestamps');return {...structuredClone(value),payload:templatePayload(value.payload)}as unknown as TaskTemplate;
}
export function instantiateTemplateInput(raw:unknown):InstantiateTemplateInput {const value=object(raw);keys(value,['listId','expectedListRevision']);text(value.listId,256);integer(value.expectedListRevision,1);return structuredClone(value)as unknown as InstantiateTemplateInput;}
export interface TaskTemplateSummary {id:string;sourceTaskId:string;sourceRevision:number;revision:number;title:string;priority:Priority;checklistCount:number;createdAt:string;updatedAt:string}
export function taskTemplateSummaryValue(raw:unknown):TaskTemplateSummary {const value=object(raw);keys(value,['id','sourceTaskId','sourceRevision','revision','title','priority','checklistCount','createdAt','updatedAt']);text(value.id,256);text(value.sourceTaskId,256);integer(value.sourceRevision,1);integer(value.revision,1);text(value.title,500);choice(value.priority,['high','medium','low','none']);integer(value.checklistCount,0,200);if(utcInstant(value.updatedAt as string)<utcInstant(value.createdAt as string))throw Error('Invalid template summary timestamps');return structuredClone(value)as unknown as TaskTemplateSummary;}
