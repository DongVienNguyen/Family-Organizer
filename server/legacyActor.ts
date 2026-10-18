/** @license SPDX-License-Identifier: Apache-2.0 */
import {UserRole,type FamilyOrganizerDB} from '../src/types.js';
import {getAppCommandContext} from './commandContext.js';
import {AppStoreError} from './appErrors.js';
import type {LegacyActor} from './legacyVisibility.js';
export function currentLegacyActor(db:FamilyOrganizerDB,id:string):LegacyActor {
 const context=getAppCommandContext(),user=db.users.find(u=>u.id===id);
 if(context&&context.actorId!==id||!user||user.isDeleted||!Object.values(UserRole).includes(user.role))throw new AppStoreError('Bạn không có quyền thực hiện thao tác này.',403);
 return {userId:id,role:user.role};
}
