/** @license SPDX-License-Identifier: Apache-2.0 */
import {AppStoreError} from './appErrors.js';
export const contentText=(value:unknown,max:number,empty=true)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0);
export const plainContentObject=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
/** Pure HTTP shape guard: no configuration or storage imports. */
export function validateContentHeader(value:unknown):asserts value is Record<string,any> {
 if(!plainContentObject(value))throw new AppStoreError('Dữ liệu nội dung không hợp lệ.',400);
 const input=value as Record<string,any>;
 if(input.id!==undefined&&!contentText(input.id,256,false)||input.baseUpdatedAt!==undefined&&!contentText(input.baseUpdatedAt,64))throw new AppStoreError('Dữ liệu nội dung không hợp lệ.',400);
}
