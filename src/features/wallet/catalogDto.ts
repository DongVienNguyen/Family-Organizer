import {object,text,choice,integer,boolean,keys} from '../productivity/validation.js';
import {catalogReferencesValue} from './catalogReferences.js';
import type {WalletCatalogItem,WalletCategoryView} from '../../../server/wallet/catalogView.js';
function timestamp(value:unknown):void {if(value===null)return;text(value,24);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Invalid catalog time');}
export function catalogItemValue(raw:unknown,kind:'category',id?:string,revision?:number):WalletCategoryView;
export function catalogItemValue(raw:unknown,kind:'label',id?:string,revision?:number):WalletCatalogItem;
export function catalogItemValue(raw:unknown,kind:'category'|'label',id?:string,revision?:number):WalletCategoryView|WalletCatalogItem {
    const value=object(raw);text(value.id,256);text(value.name,500);text(value.icon,256,false);text(value.color,256,false);boolean(value.hidden);integer(value.revision,1);timestamp(value.archivedAt);
    if(id!==undefined&&value.id!==id||revision!==undefined&&(revision===0?value.revision!==1:value.revision!==revision&&value.revision!==revision+1))throw Error('Catalog acknowledgement identity/revision');
    const item:WalletCatalogItem={id:value.id,name:value.name,icon:value.icon,color:value.color,hidden:value.hidden,revision:value.revision,archivedAt:value.archivedAt as string|null};
    if(kind==='label')return item;
    if(value.parentId!==null)text(value.parentId,256);if(value.parentId===value.id)throw Error('Catalog self parent');choice(value.nature,['must','need','want','unspecified']);return {...item,parentId:value.parentId as string|null,nature:value.nature};
}
export function catalogDeletionValue(raw:unknown,id:string){const value=object(raw);keys(value,['id','revision','canDelete','references']);if(value.id!==id)throw Error('Catalog preview identity');integer(value.revision,1);boolean(value.canDelete);const references=catalogReferencesValue(value.references),blocked=references.children+references.records+references.allocations>0||references.history||references.otherRestricted;if(value.canDelete===blocked)throw Error('Catalog preview coverage');return {id,revision:value.revision,canDelete:value.canDelete,references};}
export function catalogDeletedValue(raw:unknown,id:string,revision:number){const value=object(raw);keys(value,['id','revision','deleted']);if(value.id!==id||value.deleted!==true||value.revision!==revision+1)throw Error('Catalog deletion acknowledgement');integer(value.revision,1);return {id,revision:value.revision,deleted:true as const};}
