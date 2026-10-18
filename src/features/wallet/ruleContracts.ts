import type {RecordKind,Source} from './contracts.js';
import {object,keys,text,integer,boolean,choice,strings} from '../productivity/validation.js';
import {normalizeSearchText,matchesQuery} from '../../utils/searchText.js';

export interface RuleDraft {
 name:string;
 criteria:{keywords:string[];keywordMatch:'any'|'all';kinds:Exclude<RecordKind,'trade'>[];sources:('import'|'manual')[]};
 priority:number;
 stopOnMatch:boolean;
 actions:{categoryId?:string|null;labelIds?:string[];markReviewed?:true};
}
export interface RuleCandidate {
 id:string;revision:number;kind:RecordKind;source:Source;note:string;payee:string;
 categoryId:string|null;labelIds:string[];reviewedAt:string|null;
 categoryOrigin:'unclassified'|'manual'|'rule';labelsManual:boolean;reviewManual:boolean;
}
export interface RuleMetadata {categoryId:string|null;labelIds:string[];reviewed:boolean}
export interface RuleProposal {id:string;revision:number;before:RuleMetadata;after:RuleMetadata;matched:number[];changed:boolean;reason:'no-match'|'manual-category'|'unchanged'|'changed'|'unsupported'}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function list<T extends string>(value:unknown,allowed:readonly T[],fallback:T[]):T[]{
 if(value===undefined)return [...fallback];
 strings(value);if(!value.length||new Set(value).size!==value.length)throw Error('Invalid rule choices');
 for(const item of value)choice(item,allowed);return [...value] as T[];
}
/** Shared strict contract: there are deliberately no financial or provider actions. */
export function normalizeRuleDraft(raw:unknown):RuleDraft {
 const value=object(raw);keys(value,['name','criteria','priority','stopOnMatch','actions']);
 if(Object.values(value).some(v=>v===undefined))throw Error('Undefined rule field');
 text(value.name,500);integer(value.priority,0,1000000);boolean(value.stopOnMatch);
 const criteria=object(value.criteria);keys(criteria,['keywords','keywordMatch','kinds','sources']);
 strings(criteria.keywords);if(criteria.keywords.length>32)throw Error('Too many rule keywords');
 const keywords=[...new Set(criteria.keywords.map(normalizeSearchText))];if(keywords.some(v=>!v))throw Error('Empty rule keyword');
 const keywordMatch=criteria.keywordMatch??'any';choice(keywordMatch,['any','all']);
 const kinds=list(criteria.kinds,['income','expense','transfer','adjustment'],['income','expense']);
 const sources=list(criteria.sources,['import','manual'],['import']);
 const action=object(value.actions);keys(action,['categoryId','labelIds','markReviewed']);
 if(!Object.keys(action).length||Object.values(action).some(v=>v===undefined))throw Error('Empty rule action');
 const actions:RuleDraft['actions']={};
 if('categoryId'in action){if(action.categoryId!==null)text(action.categoryId,256);actions.categoryId=action.categoryId as string|null;}
 if('labelIds'in action){strings(action.labelIds);if(!action.labelIds.length||action.labelIds.length>20||new Set(action.labelIds).size!==action.labelIds.length)throw Error('Invalid rule labels');actions.labelIds=[...action.labelIds].sort(compare);}
 if('markReviewed'in action){if(action.markReviewed!==true)throw Error('Rules can only mark reviewed');actions.markReviewed=true;}
 return {name:value.name.trim(),criteria:{keywords,keywordMatch,kinds,sources},priority:value.priority,stopOnMatch:value.stopOnMatch,actions};
}
const metadata=(value:RuleCandidate):RuleMetadata=>({categoryId:value.categoryId,labelIds:[...value.labelIds].sort(compare),reviewed:value.reviewedAt!==null});
/** Pure dry run. Caller owns ACL/revisions, persistence and the one I01 writer. */
export function evaluateRules(value:RuleCandidate,rules:readonly RuleDraft[]):RuleProposal {
 const before=metadata(value),after=structuredClone(before),matched:number[]=[];
 let categoryClaimed=false;
 for(const {rule,index}of rules.map((rule,index)=>({rule,index})).sort((a,b)=>a.rule.priority-b.rule.priority||a.index-b.index)){
  if(!rule.criteria.sources.includes(value.source as 'import'|'manual')||!rule.criteria.kinds.includes(value.kind as Exclude<RecordKind,'trade'>))continue;
  const matches=(keyword:string)=>matchesQuery(keyword,value.note,value.payee);
  if(rule.criteria.keywords.length&&!(rule.criteria.keywordMatch==='all'?rule.criteria.keywords.every(matches):rule.criteria.keywords.some(matches)))continue;
  matched.push(index);
  if(value.categoryOrigin!=='manual'){
   if(!categoryClaimed&&'categoryId'in rule.actions){after.categoryId=rule.actions.categoryId!;categoryClaimed=true;}
   if(!value.labelsManual&&rule.actions.labelIds)after.labelIds=[...new Set([...after.labelIds,...rule.actions.labelIds])].sort(compare);
   if(!value.reviewManual&&rule.actions.markReviewed)after.reviewed=true;
  }
  if(rule.stopOnMatch)break;
 }
 if(after.labelIds.length>20)throw Error('Rule label limit exceeded');
 const changed=JSON.stringify(before)!==JSON.stringify(after);
 return {id:value.id,revision:value.revision,before,after,matched,changed,reason:!matched.length?'no-match':value.categoryOrigin==='manual'?'manual-category':changed?'changed':'unchanged'};
}

export function ruleProposalValue(raw:unknown):RuleProposal {
 const v=object(raw);keys(v,['id','revision','before','after','matched','changed','reason']);if(Object.keys(v).length!==7)throw Error('Incomplete rule proposal');text(v.id,256);integer(v.revision,1);boolean(v.changed);choice(v.reason,['no-match','manual-category','unchanged','changed','unsupported']);
 for(const field of ['before','after']){const m=object(v[field]);keys(m,['categoryId','labelIds','reviewed']);if(Object.keys(m).length!==3)throw Error('Incomplete rule metadata');if(m.categoryId!==null)text(m.categoryId,256);if(!Array.isArray(m.labelIds)||m.labelIds.length>20||new Set(m.labelIds).size!==m.labelIds.length)throw Error('Invalid preview labels');for(const id of m.labelIds)text(id,256);boolean(m.reviewed);}
 if(!Array.isArray(v.matched)||v.matched.length>100||new Set(v.matched).size!==v.matched.length)throw Error('Invalid matched rules');for(const index of v.matched)integer(index,0,99);
 if(v.changed!==(JSON.stringify(v.before)!==JSON.stringify(v.after))||v.changed!==(v.reason==='changed'))throw Error('Invalid rule proposal change');return structuredClone(v) as unknown as RuleProposal;
}
