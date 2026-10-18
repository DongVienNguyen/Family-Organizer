import {UserRole,isLimitedViewer} from '../src/types.js';
export interface LegacyActor {userId:string;role:UserRole}
interface SharedObject {isShared:boolean;creatorId:string}
const known=(actor:LegacyActor)=>Object.values(UserRole).includes(actor.role);
export const isAdult=(actor:LegacyActor)=>actor.role===UserRole.ADMIN||actor.role===UserRole.MEMBER;
export const canViewLegacyTask=(task:SharedObject&{id?:string;assigneeId?:string|null},actor:LegacyActor)=>known(actor)&&(canonicalTaskPolicyActive()?taskPolicy!.read(task,actor):!isLimitedViewer(actor.role)||task.isShared===true||task.creatorId===actor.userId||task.assigneeId===actor.userId);
export const canViewLegacyPlan=(plan:SharedObject,actor:LegacyActor)=>known(actor)&&(plan.isShared===true||plan.creatorId===actor.userId||actor.role===UserRole.ADMIN);
export const canViewLegacyNote=canViewLegacyPlan;
export const canViewLegacySavingsGoal=(goal:SharedObject,actor:LegacyActor)=>isAdult(actor)&&(goal.isShared===true||goal.creatorId===actor.userId);
export const canViewLegacyDocument=(doc:SharedObject&{ownerId?:string},actor:LegacyActor)=>isAdult(actor)&&(doc.isShared===true||doc.creatorId===actor.userId||doc.ownerId===actor.userId);

export const canViewLegacyPatient=(patientId:unknown,actor:LegacyActor)=>known(actor)&&(isAdult(actor)||(typeof patientId==='string'&&patientId===actor.userId));
export const canViewLegacyNotification=(notification:{userId:string},actor:LegacyActor)=>known(actor)&&(notification.userId==='all'||notification.userId===actor.userId);
export const canEditLegacyTask=(task:SharedObject&{id?:string;assigneeId?:string|null},actor:LegacyActor)=>known(actor)&&(canonicalTaskPolicyActive()?taskPolicy!.edit(task,actor):isAdult(actor)||(actor.role===UserRole.CHILD&&(task.creatorId===actor.userId||task.assigneeId===actor.userId)));
export const canEditLegacyNote=(note:SharedObject&{allowedRolesToEdit?:UserRole[]},actor:LegacyActor)=>canViewLegacyNote(note,actor)&&(note.creatorId===actor.userId||Array.isArray(note.allowedRolesToEdit)&&note.allowedRolesToEdit.includes(actor.role));
/** Explicit canonical bootstrap installs policy without opening storage here. */
let taskPolicy:{active():boolean;read(task:SharedObject&{id?:string;assigneeId?:string|null},actor:LegacyActor):boolean;edit(task:SharedObject&{id?:string;assigneeId?:string|null},actor:LegacyActor):boolean;create(actor:LegacyActor):boolean;tags?(input:unknown,actor:LegacyActor,persist:boolean):string[];tagNames?(ids:readonly string[],actor:LegacyActor):string[]}|undefined;
export function installCanonicalTaskVisibility(policy:NonNullable<typeof taskPolicy>):void {if(taskPolicy&&taskPolicy!==policy)throw Error('Task visibility already installed');taskPolicy=policy;}
export function canonicalTaskPolicyActive():boolean {return taskPolicy?.active()??false;}
export const canCreateLegacyTask=(actor:LegacyActor)=>known(actor)&&(canonicalTaskPolicyActive()?taskPolicy!.create(actor):isAdult(actor)||actor.role===UserRole.CHILD);

/** Actor is selected from the live legacy document; no caller-selected role. */
export function canonicalLegacyTaskTags(input:unknown,actor:LegacyActor,persist=false):string[]{return canonicalTaskPolicyActive()&&taskPolicy?.tags?taskPolicy.tags(input,actor,persist):input as string[];}

export function canonicalLegacyTagNames(ids:readonly string[]|undefined,actor:LegacyActor):string[]{const values=Array.isArray(ids)?ids:[];return canonicalTaskPolicyActive()&&taskPolicy?.tagNames?taskPolicy.tagNames(values,actor):[...values];}
