import {taskTemplateValue,type TaskTemplate} from '../../src/features/productivity/templateContract.js';
import {text,integer} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {productivityVersionsFrom} from './knownVersions.js';
import type {TaskReader} from './access.js';
export function decodeTaskTemplate(row:any):TaskTemplate {return taskTemplateValue({id:row.id,sourceTaskId:row.source_task_id,sourceRevision:row.source_revision,revision:row.revision,payload:JSON.parse(row.payload_json),createdAt:row.created_at,updatedAt:row.updated_at});}
export function validateTaskTemplateRows(rows:any[],tasks:Map<string,{revision:number}>,userIds:Set<string>):void {
 const ids=new Set<string>();for(const row of rows){const template=decodeTaskTemplate(row);text(row.owner_id,256);integer(row.revision,1);const source=tasks.get(template.sourceTaskId);if(ids.has(row.id)||!source||source.revision<template.sourceRevision||!userIds.has(row.owner_id))throw Error('Invalid task template snapshot reference');ids.add(row.id);if(row.deleted_at!==null&&(utcInstant(row.deleted_at)<utcInstant(row.created_at)||utcInstant(row.deleted_at)>utcInstant(row.updated_at)))throw Error('Invalid task template deletion timestamp');}
}
export function validateTaskTemplateStorage(reader:TaskReader):void {if(!productivityVersionsFrom(15).includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))return;validateTaskTemplateRows(reader.all('SELECT * FROM productivity_task_templates'),new Map(reader.all('SELECT id,revision FROM productivity_tasks').map(row=>[row.id,row])),new Set(reader.all('SELECT id FROM users').map(row=>row.id)));}
