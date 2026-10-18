import type {TaskApi} from './api.js';
import {createDraftCommandState} from './draftCommandState.js';
import {text,integer} from './validation.js';
import {instantiateTemplateInput,type InstantiateTemplateInput} from './templateContract.js';
export type TemplateCommand={kind:'save';sourceTaskId:string;revision:number;summary:string}|{kind:'instantiate';sourceTaskId:string;templateId:string;revision:number;input:InstantiateTemplateInput;summary:string}|{kind:'delete';sourceTaskId:string;templateId:string;revision:number;summary:string};
type TemplateResult={kind:'save'}|{kind:'delete'}|{kind:'instantiate';taskId:string};
export function createTemplateCommandSession(ports:{api:Pick<TaskApi,'saveTaskTemplate'|'instantiateTemplate'|'deleteTemplate'>;onCommitted(result:TemplateResult):Promise<void>}){
 const command=createDraftCommandState<TemplateCommand,TemplateResult>({validate:draft=>{text(draft.sourceTaskId,256);integer(draft.revision,1);text(draft.summary,2000);if(draft.kind!=='save'){text(draft.templateId,256);if(draft.kind==='instantiate')instantiateTemplateInput(draft.input);else if(draft.kind!=='delete')throw Error('Unsupported template command');}},send:async(draft,key)=>{if(draft.kind==='save'){await ports.api.saveTaskTemplate(draft.sourceTaskId,draft.revision,key);return {kind:'save'};}if(draft.kind==='delete'){await ports.api.deleteTemplate(draft.templateId,draft.revision,key);return {kind:'delete'};}const task=await ports.api.instantiateTemplate(draft.templateId,draft.revision,draft.input,key);return {kind:'instantiate',taskId:task.id};},onCommitted:ports.onCommitted});
 let expanded=false,disposed=false;const listeners=new Set<()=>void>();
 const setLibraryOpen=(value:boolean)=>{if(disposed||expanded===value)return;expanded=value;for(const listener of listeners)listener();};
 let sourceIds=new Set<string>(),listIds=new Set<string>();
 const allowed=(draft:TemplateCommand)=>sourceIds.has(draft.sourceTaskId)&&(draft.kind!=='instantiate'||listIds.has(draft.input.listId));
 return {...command,libraryOpen:()=>expanded,subscribeLibrary(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},setLibraryOpen,dispose(){if(disposed)return;command.dispose();setLibraryOpen(false);disposed=true;listeners.clear();},open(draft:TemplateCommand){if(!allowed(draft)||command.snapshot().writing||command.snapshot().locked)return false;command.open(draft);setLibraryOpen(true);return true;},clear(){sourceIds.clear();listIds.clear();command.clear();setLibraryOpen(false);},reconcile(ids:readonly string[],lists:readonly string[]){sourceIds=new Set(ids);listIds=new Set(lists);const draft=command.snapshot().draft;if(draft&&!allowed(draft))command.clear();}};
}
export type TemplateCommandSession=ReturnType<typeof createTemplateCommandSession>;
