import Database from 'better-sqlite3';
import path from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {FamilyDB} from './db.js';
import {sqliteLoad,sqliteSave} from './sqlite.js';
import {UserRole,type StoredMealPlan} from '../src/types.js';
function stored(table:string):any[]{const reader=new Database(path.join(process.env.DATA_DIR!,'family.db'),{readonly:true,fileMustExist:true});try{return reader.prepare(`SELECT data FROM ${table} ORDER BY seq ASC`).all().map((row:any)=>JSON.parse(row.data));}finally{reader.close();}}
function storedMeal():unknown{const reader=new Database(path.join(process.env.DATA_DIR!,'family.db'),{readonly:true,fileMustExist:true});try{return JSON.parse((reader.prepare("SELECT value FROM app_meta WHERE key='singleton:mealPlan'").get() as any).value);}finally{reader.close();}}
beforeEach(()=>{const data=sqliteLoad();data.users=Object.values(UserRole).map(role=>({id:role,role,username:'synthetic-'+role,fullName:'Synthetic '+role,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-11T00:00:00Z'}));data.shoppingItems=[];data.dishLibrary=[];data.mealPlan=null;data.activityLogs=[];data.notifications=[];sqliteSave(data);});
afterEach(()=>vi.useRealTimers());
it('keeps two same-millisecond shopping commands as distinct persistent items',()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-11T09:00:00Z'));
 const first=FamilyDB.saveShoppingItem({name:'Synthetic rice',quantity:'1 kg'},UserRole.ADMIN,'synthetic');
 const second=FamilyDB.saveShoppingItem({name:'Synthetic vegetables',quantity:'2 bundles'},UserRole.MEMBER,'synthetic');
 expect(second.id).not.toBe(first.id);
 expect(stored('shopping_items').map(row=>row.id).sort()).toEqual([first.id,second.id].sort());
 FamilyDB.toggleShoppingItem(first.id,UserRole.CHILD);
 expect(FamilyDB.getShoppingItems().find(row=>row.id===first.id)).toMatchObject({name:'Synthetic rice',isPurchased:true,purchasedById:UserRole.CHILD});
 expect(FamilyDB.getShoppingItems().find(row=>row.id===second.id)).toMatchObject({name:'Synthetic vegetables',isPurchased:false,purchasedById:null});
 FamilyDB.deleteShoppingItem(first.id,UserRole.ADMIN,'synthetic');
 expect(FamilyDB.getShoppingItems().map(row=>row.id)).toEqual([second.id]);
});
it('preserves shopping edits and purchased attribution in an independent readonly SQLite connection',()=>{
 const item=FamilyDB.saveShoppingItem({name:' Synthetic milk ',quantity:' 2 cartons ',note:' cold ',cat:' Synthetic food '},UserRole.ADMIN,'synthetic');
 expect(item).toMatchObject({name:'Synthetic milk',quantity:'2 cartons',note:'cold',cat:'Synthetic food',creatorId:UserRole.ADMIN,isPurchased:false});
 FamilyDB.saveShoppingItem({id:item.id,quantity:'3 cartons',note:'Synthetic updated'},UserRole.MEMBER,'synthetic');
 FamilyDB.toggleShoppingItem(item.id,UserRole.CHILD);
 expect(stored('shopping_items')[0]).toMatchObject({id:item.id,quantity:'3 cartons',note:'Synthetic updated',isPurchased:true,purchasedById:UserRole.CHILD,creatorId:UserRole.ADMIN});
 FamilyDB.toggleShoppingItem(item.id,UserRole.GUEST);expect(FamilyDB.getShoppingItems()[0]).toMatchObject({isPurchased:false,purchasedById:null});
});
it('clears only purchased shopping items and records one actual removal',()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-11T09:00:00Z'));
 const first=FamilyDB.saveShoppingItem({name:'Synthetic purchased'},UserRole.ADMIN,'synthetic');
 vi.setSystemTime(new Date('2026-10-11T09:00:00.001Z'));
 const second=FamilyDB.saveShoppingItem({name:'Synthetic pending'},UserRole.MEMBER,'synthetic');
 FamilyDB.toggleShoppingItem(first.id,UserRole.CHILD);
 expect(FamilyDB.clearPurchasedShopping(UserRole.ADMIN,'synthetic')).toBe(1);
 expect(FamilyDB.getShoppingItems().map(row=>row.id)).toEqual([second.id]);
 expect(FamilyDB.clearPurchasedShopping(UserRole.ADMIN,'synthetic')).toBe(0);
 expect(FamilyDB.getActivityLogs().filter(row=>row.action==='Dọn đồ đã mua')).toHaveLength(1);
 expect(FamilyDB.clearAllShopping(UserRole.ADMIN,'synthetic')).toBe(1);expect(FamilyDB.getShoppingItems()).toEqual([]);
});
it('tops up seed dishes without duplicating or discarding a learned dish in SQLite',()=>{
 const data=sqliteLoad();const learned={id:'synthetic-learned-dish',name:'Synthetic family dish',slot:'main' as const,ingredients:[{name:'Synthetic beans',cat:'Đạm' as const}],source:'ai' as const,createdAt:'2026-10-11T00:00:00Z'};data.dishLibrary=[learned];sqliteSave(data);
 const initial=FamilyDB.getDishLibrary();expect(initial.length).toBeGreaterThan(1);expect(initial).toContainEqual(learned);const before=[...initial];expect(stored('dish_library')).toEqual(before);
 expect(FamilyDB.getDishLibrary()).toEqual(before);expect(new Set(FamilyDB.getDishLibrary().map(row=>row.id)).size).toBe(before.length);
});
it('persists the shared meal plan, groceries and household sizes then permits clearing',()=>{
 const plan:StoredMealPlan={days:[{day:1,meals:[{meal:'Synthetic lunch',dishes:['Synthetic soup']}]}],groceries:[{name:'Synthetic tofu',cat:'Đạm',quantity:'2 packages',meals:['Synthetic lunch'],dishes:['Synthetic soup']}],source:'synthetic-offline',adults:2,children:1,updatedAt:'2026-10-11T00:00:00Z',updatedById:UserRole.ADMIN};
 FamilyDB.setMealPlan(plan);expect(storedMeal()).toEqual(plan);expect(FamilyDB.getMealPlan()).toEqual(plan);
 FamilyDB.setMealPlan(null);expect(storedMeal()).toBeNull();expect(FamilyDB.getMealPlan()).toBeNull();
});
