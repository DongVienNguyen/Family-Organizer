import {expect,it} from 'vitest';
import {UserRole} from '../src/types.js';
import {canViewLegacyTask,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument} from './legacyVisibility.js';
const actor=(role:UserRole,userId='viewer')=>({role,userId});
const privateObject={isShared:false,creatorId:'creator'};
it.each([canViewLegacyTask,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument].flatMap(view=>[['string',view,'false'],['number',view,1]] as const))('rejects a malformed %s sharing flag',(_kind,view,flag)=>{
  expect(view({...privateObject,isShared:flag as any},actor(view===canViewLegacyDocument?UserRole.MEMBER:UserRole.CHILD))).toBe(false);
});
it.each([canViewLegacyTask,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument])('fails closed for an unknown role even on shared objects',view=>{
  expect(view({...privateObject,isShared:true},actor('synthetic-unknown' as UserRole))).toBe(false);
});
it('preserves legacy adult task management and limited-viewer shared/creator/assignee rules',()=>{
  expect(canViewLegacyTask(privateObject,actor(UserRole.MEMBER))).toBe(true);expect(canViewLegacyTask(privateObject,actor(UserRole.ADMIN))).toBe(true);
  for(const role of [UserRole.CHILD,UserRole.GUEST]){expect(canViewLegacyTask(privateObject,actor(role))).toBe(false);expect(canViewLegacyTask({...privateObject,isShared:true},actor(role))).toBe(true);expect(canViewLegacyTask(privateObject,actor(role,'creator'))).toBe(true);expect(canViewLegacyTask({...privateObject,assigneeId:'viewer'},actor(role))).toBe(true);}
});
it.each([canViewLegacyPlan,canViewLegacyNote])('preserves shared/owner/admin private plan and note access',view=>{
  expect(view(privateObject,actor(UserRole.MEMBER))).toBe(false);expect(view(privateObject,actor(UserRole.CHILD))).toBe(false);expect(view(privateObject,actor(UserRole.GUEST))).toBe(false);expect(view(privateObject,actor(UserRole.ADMIN))).toBe(true);expect(view(privateObject,actor(UserRole.MEMBER,'creator'))).toBe(true);expect(view({...privateObject,isShared:true},actor(UserRole.CHILD))).toBe(true);
});
it('does not infer access to another adult private document from the admin role',()=>{
  expect(canViewLegacyDocument(privateObject,actor(UserRole.ADMIN))).toBe(false);expect(canViewLegacyDocument(privateObject,actor(UserRole.MEMBER,'creator'))).toBe(true);expect(canViewLegacyDocument({...privateObject,ownerId:'viewer'},actor(UserRole.MEMBER))).toBe(true);expect(canViewLegacyDocument({...privateObject,isShared:true},actor(UserRole.ADMIN))).toBe(true);
  for(const role of [UserRole.CHILD,UserRole.GUEST])expect(canViewLegacyDocument({...privateObject,isShared:true,ownerId:'viewer'},actor(role,'creator'))).toBe(false);
});
