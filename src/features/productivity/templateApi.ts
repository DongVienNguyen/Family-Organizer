import {object,keys,text,integer} from './validation.js';
import {taskTemplateValue,taskTemplateSummaryValue,instantiateTemplateInput,type InstantiateTemplateInput} from './templateContract.js';
import type {TaskRecord} from './contracts.js';
type Read=(path:string,method?:string,body?:unknown,key?:string,signal?:AbortSignal)=>Promise<Record<string,any>>;
export function createTaskTemplateApi(read:Read,taskValue:(raw:unknown)=>TaskRecord){
 const path=(id:string)=>{text(id,256);return '/api/productivity/templates/'+encodeURIComponent(id);};
 return {
  async templates(){const data=await read('/api/productivity/templates');keys(data,['items']);if(!Array.isArray(data.items)||data.items.length>100)throw Error('Invalid templates');const items=data.items.map(taskTemplateSummaryValue);if(new Set(items.map(row=>row.id)).size!==items.length)throw Error('Duplicate template');return items;},
  async template(id:string){const data=await read(path(id));keys(data,['template']);const value=taskTemplateValue(data.template);if(value.id!==id)throw Error('Template identity mismatch');return value;},
  async saveTaskTemplate(taskId:string,revision:number,key:string){text(taskId,256);integer(revision,1);const data=await read('/api/productivity/tasks/'+encodeURIComponent(taskId)+'/templates','POST',{expectedRevision:revision},key);keys(data,['template']);const template=taskTemplateValue(data.template);if(template.sourceTaskId!==taskId||template.sourceRevision!==revision||template.revision!==1)throw Error('Template source mismatch');return template;},
  async instantiateTemplate(templateId:string,revision:number,input:InstantiateTemplateInput,key:string){integer(revision,1);const value=instantiateTemplateInput(input),data=await read(path(templateId)+'/instantiate','POST',{expectedRevision:revision,input:value},key);keys(data,['task']);const task=taskValue(data.task);if(task.listId!==input.listId||task.revision!==1||task.lifecycle!=='todo'||task.rewardPoints!==0||task.pendingApproval||task.due.kind!=='none'||task.parentId!==null||task.sectionId!==null||task.assigneeId!==null||task.scheduledStart!==null||task.scheduledEnd!==null||task.tagIds.length)throw Error('Invalid template instance');return task;},
  async deleteTemplate(templateId:string,revision:number,key:string){integer(revision,1);const data=object(await read(path(templateId),'DELETE',{expectedRevision:revision},key));keys(data,['id','deleted']);if(data.id!==templateId||data.deleted!==true)throw Error('Invalid template deletion');return {id:templateId,deleted:true as const};},
 };
}
