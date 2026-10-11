import {UserRole,isLimitedViewer} from '../src/types.js';
export interface LegacyActor {userId:string;role:UserRole}
interface SharedObject {isShared:boolean;creatorId:string}
const known=(actor:LegacyActor)=>Object.values(UserRole).includes(actor.role);
export const isAdult=(actor:LegacyActor)=>actor.role===UserRole.ADMIN||actor.role===UserRole.MEMBER;
export const canViewLegacyTask=(task:SharedObject&{assigneeId?:string|null},actor:LegacyActor)=>known(actor)&&(!isLimitedViewer(actor.role)||task.isShared===true||task.creatorId===actor.userId||task.assigneeId===actor.userId);
export const canViewLegacyPlan=(plan:SharedObject,actor:LegacyActor)=>known(actor)&&(plan.isShared===true||plan.creatorId===actor.userId||actor.role===UserRole.ADMIN);
export const canViewLegacyNote=canViewLegacyPlan;
export const canViewLegacyDocument=(doc:SharedObject&{ownerId?:string},actor:LegacyActor)=>isAdult(actor)&&(doc.isShared===true||doc.creatorId===actor.userId||doc.ownerId===actor.userId);
