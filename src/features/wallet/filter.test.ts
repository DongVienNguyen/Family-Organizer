import type {FilterRecord} from './contracts.js';
import {it,expect} from 'vitest';
import {normalizeFilter,matchesRecordFilter} from './filter.js';
const raw={period:{fromDate:'2028-02-01',toDateExclusive:'2028-03-01',timezone:'Asia/Saigon'},referenceCurrency:'VND'};
const record:FilterRecord={id:'synthetic',effectiveDate:'2028-02-29',accountIds:['cash'],categoryId:'food-child',labelIds:['family','home'],currency:'VND',kind:'expense',status:'cleared',paymentMethod:'cash',creatorId:'adult',searchText:'Bữa cơm gia đình',minor:'150000'};
it('normalization strictly validates contract, deduplicates IDs and supplies explicit defaults',()=>{
 const f=normalizeFilter({...raw,labelIds:['family','family']});expect(f.labelIds).toEqual(['family']);expect(f.labelMatch).toBe('any');expect(f.transferMode).toBe('include');
 for(const patch of [{unexpected:true},{absoluteMin:'-1'},{absoluteMin:'200',absoluteMax:'100'},{currencies:['EUR']},{labelMatch:'both'},{kinds:['secret']},{accountIds:'cash'},{period:{...raw.period,toDateExclusive:'2028-02-01'}}])expect(()=>normalizeFilter({...raw,...patch})).toThrow();
});
it('OR within dimensions and AND between dimensions, labels any/all and descendant categories',()=>{
 const categories=[{id:'food',parentId:null},{id:'food-child',parentId:'food'}];
 expect(matchesRecordFilter(record,normalizeFilter({...raw,accountIds:['bank','cash'],categoryIds:['food'],labelIds:['missing','family']}),categories)).toBe(true);
 expect(matchesRecordFilter(record,normalizeFilter({...raw,labelIds:['missing','family'],labelMatch:'all'}),categories)).toBe(false);
 expect(matchesRecordFilter(record,normalizeFilter({...raw,accountIds:['bank'],labelIds:['family']}),categories)).toBe(false);
 expect(matchesRecordFilter(record,normalizeFilter({...raw,labelIds:[]}),categories)).toBe(false);
 expect(matchesRecordFilter(record,normalizeFilter({...raw,query:'bua com'}),categories)).toBe(true);
});
it('halfopen periods, transfers and exact absolute reference values are enforced',()=>{
 const f=normalizeFilter({...raw,absoluteMin:'150000',absoluteMax:'150000'});
 expect(matchesRecordFilter(record,f,[])).toBe(true);expect(matchesRecordFilter({...record,minor:'-150000'},f,[])).toBe(true);
 expect(matchesRecordFilter({...record,effectiveDate:'2028-03-01'},f,[])).toBe(false);
 expect(matchesRecordFilter({...record,kind:'transfer'},normalizeFilter({...raw,transferMode:'exclude'}),[])).toBe(false);
 expect(matchesRecordFilter(record,normalizeFilter({...raw,transferMode:'only'}),[])).toBe(false);
 expect(()=>matchesRecordFilter({...record,currency:'USD',minor:'100'},f,[])).toThrow();
 expect(matchesRecordFilter({...record,currency:'USD',minor:'100'},f,[],{minor:'150000',currency:'VND'})).toBe(true);
});
it('invalid category cycles and records refuse rather than silently bypass filters',()=>{
 expect(()=>matchesRecordFilter(record,normalizeFilter({...raw,categoryIds:['food']}),[{id:'food',parentId:'food-child'},{id:'food-child',parentId:'food'}])).toThrow();
 expect(()=>matchesRecordFilter({...record,effectiveDate:'2028-02-30'},normalizeFilter(raw),[])).toThrow();
 expect(()=>normalizeFilter(null)).toThrow();
});
