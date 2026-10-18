import {randomUUID} from 'node:crypto';
import {setImmediate as yieldImmediate} from 'node:timers/promises';
import type {Actor,CommandContext,RecordFilter} from '../../src/features/wallet/contracts.js';
import {normalizeRuleDraft,evaluateRules,type RuleDraft,type RuleProposal} from '../../src/features/wallet/ruleContracts.js';
import {normalizeFilter} from '../../src/features/wallet/filter.js';
import {object,keys,text,boolean,strings} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {assertWalletActor,createWalletAccess,type WalletReader} from './access.js';
import {assertWalletCommandContext} from './accounts.js';
import {checkWalletCatalog} from './records.js';
import {createWalletQueries} from './query.js';
import {createWalletReads} from './read.js';
import {openWalletStore,type WalletTx} from './store.js';
import {ruleHash,ruleProposalValue} from './ruleSchema.js';
import {readRuleOrigins} from './ruleOverrides.js';

export interface WalletRuleHeader {id:string;name:string;priority:number;revision:number;archivedAt:string|null}
export interface RulePreviewSummary {id:string;hash:string;revision:number;state:'ready'|'applied';count:number;changed:number;unchanged:number;createdAt:string;expiresAt:string}
export type RulePreviewInput={drafts:RuleDraft[]}|{ruleIds:string[]};
const fail=(status:number,message:string,code='wallet-rule'):never=>{throw new AppStoreError(message,status,code);};
const sqlReader=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
const sort=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
function input<T>(fn:()=>T):T{try{return fn();}catch(error){if(error instanceof AppStoreError)throw error;return fail(400,'Cấu hình quy tắc không hợp lệ.');}}
function guard(reader:WalletReader,actor:Actor){assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_rules'"))fail(409,'Kho quy tắc Wallet chưa sẵn sàng.');}
function owned(reader:WalletReader,actor:Actor,id:string){input(()=>text(id,256));const row=reader.get('SELECT * FROM wallet_rules WHERE id=? AND owner_id=?',id,actor.userId);if(!row)fail(404,'Không tìm thấy quy tắc.');return row;}
function header(row:any):WalletRuleHeader {const draft=normalizeRuleDraft(JSON.parse(row.draft_json));return {id:row.id,name:draft.name,priority:draft.priority,revision:row.revision,archivedAt:row.archived_at};}
function catalog(reader:WalletReader,rules:RuleDraft[]){for(const rule of rules)checkWalletCatalog(reader,rule.actions.categoryId??null,rule.actions.labelIds??[]);}
function previewInput(raw:unknown):RulePreviewInput{return input(()=>{const v=object(raw);if('drafts'in v){keys(v,['drafts']);if(!Array.isArray(v.drafts)||!v.drafts.length||v.drafts.length>100)throw Error();return {drafts:v.drafts.map(normalizeRuleDraft)};}keys(v,['ruleIds']);strings(v.ruleIds);if(!v.ruleIds.length||v.ruleIds.length>100||new Set(v.ruleIds).size!==v.ruleIds.length)throw Error();return {ruleIds:[...v.ruleIds]};});}
function loadRules(reader:WalletReader,actor:Actor,raw:RulePreviewInput){return input(()=>{const v=object(raw);if('drafts'in v){keys(v,['drafts']);if(!Array.isArray(v.drafts)||!v.drafts.length||v.drafts.length>100)throw Error();return {rules:v.drafts.map(normalizeRuleDraft),refs:[] as {id:string;revision:number}[]};}keys(v,['ruleIds']);strings(v.ruleIds);if(!v.ruleIds.length||v.ruleIds.length>100||new Set(v.ruleIds).size!==v.ruleIds.length)throw Error();const rows=v.ruleIds.map(id=>owned(reader,actor,id));if(rows.some(row=>row.archived_at!==null))fail(409,'Quy tắc đã được lưu trữ.');return {rules:rows.map(row=>normalizeRuleDraft(JSON.parse(row.draft_json))),refs:rows.map(row=>({id:row.id,revision:row.revision}))};});}
function assertRefs(reader:WalletReader,actor:Actor,refs:{id:string;revision:number}[]){for(const ref of refs){const row=owned(reader,actor,ref.id);if(row.revision!==ref.revision||row.archived_at!==null)fail(409,'Quy tắc vừa thay đổi.','edit-conflict');}}
function scope(reader:WalletReader,actor:Actor){guard(reader,actor);return ruleHash(createWalletAccess(reader).listAccounts(actor));}
function proposal(reader:WalletReader,actor:Actor,id:string,rules:RuleDraft[]):RuleProposal {
 const view=createWalletReads(reader).getRecord(actor,id);if(view.partial)fail(404,'Không tìm thấy giao dịch đầy đủ để phân loại.');const r=view.record,categoryId=r.categoryId??null;
 const result=evaluateRules({id:r.id,revision:r.revision,kind:r.kind,source:r.source,note:r.note,payee:view.metadata.payee,categoryId,labelIds:view.labelIds,reviewedAt:view.metadata.reviewedAt,...readRuleOrigins(reader,id,categoryId)},rules);
 let supported=!view.partial&&r.settlementStatus!=='voided'&&!r.occurrenceId&&r.kind!=='trade'&&!reader.get('SELECT 1 FROM wallet_allocations WHERE record_id=?',id)&&!reader.get('SELECT 1 FROM wallet_transfer_fees WHERE transfer_record_id=? OR fee_record_id=?',id,id);
 if(supported){const access=createWalletAccess(reader);try{access.authorizeRecord(actor,id,'write');for(const p of view.postings)if(access.getAccount(actor,p.accountId).archivedAt!==null)supported=false;}catch(error){if([403,404].includes((error as any)?.status))supported=false;else throw error;}}
 return result.changed&&!supported?{...result,after:structuredClone(result.before),changed:false,reason:'unsupported'}:result;
}
function previewHeader(reader:WalletReader,actor:Actor,id:string,time:number){guard(reader,actor);input(()=>text(id,256));const row=reader.get('SELECT * FROM wallet_rule_previews WHERE id=? AND owner_id=?',id,actor.userId);if(!row)fail(404,'Không tìm thấy bản xem trước.');if(!Number.isFinite(time)||time<Date.parse(row.created_at)||time>=Date.parse(row.expires_at))fail(409,'Bản xem trước đã hết hạn.','wallet-selection-expired');return row;}
function storedRows(reader:WalletReader,id:string){return reader.all('SELECT value_json FROM wallet_rule_preview_rows WHERE preview_id=?',id).map(row=>ruleProposalValue(JSON.parse(row.value_json))).sort(sort);}
function summary(row:any,rows:RuleProposal[]):RulePreviewSummary{const changed=rows.filter(v=>v.changed).length;return {id:row.id,hash:row.preview_hash,revision:row.revision,state:row.state,count:rows.length,changed,unchanged:rows.length-changed,createdAt:row.created_at,expiresAt:row.expires_at};}
/** Personal deterministic configuration. Preview staging owns no financial write;
 * apply is one all-or-nothing I01 transaction and never touches postings or FX. */
export function createWalletRules(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;queries?:ReturnType<typeof createWalletQueries>;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),clock=ports.now??Date.now,queries=ports.queries??createWalletQueries({reader:ports.reader});
 const run=<T>(ctx:CommandContext,command:string,payload:unknown,fn:(tx:WalletTx)=>T)=>store.transaction({actorId:ctx.actor.userId,command:'wallet:rule:'+command,requestId:ctx.idempotencyKey,payloadHash:ruleHash({expectedRevision:ctx.expectedRevision??0,payload})},fn);
 const readPreview=(actor:Actor,id:string)=>{const row=previewHeader(ports.reader,actor,id,clock()),rows=storedRows(ports.reader,id),before=scope(ports.reader,actor);for(const v of rows)if(createWalletAccess(ports.reader).getRecord(actor,v.id).partial)fail(404,'Không tìm thấy giao dịch đầy đủ để phân loại.');if(scope(ports.reader,actor)!==before)fail(409,'Quyền Wallet vừa thay đổi.');return {row,rows};};
 return {
  listRules(actor:Actor){guard(ports.reader,actor);const rows=ports.reader.all('SELECT * FROM wallet_rules WHERE owner_id=? ORDER BY id LIMIT 1001',actor.userId);if(rows.length>1000)fail(413,'Quá nhiều quy tắc.','LIMIT_EXCEEDED');return rows.map(header).sort((a,b)=>a.priority-b.priority||sort(a,b));},
  getRule(actor:Actor,id:string){guard(ports.reader,actor);const row=owned(ports.reader,actor,id);return {...header(row),draft:normalizeRuleDraft(JSON.parse(row.draft_json))};},
  saveRule(rawContext:CommandContext,raw:unknown,onChanged?:()=>void):WalletRuleHeader {
   const ctx=structuredClone(rawContext),value=input(()=>{const v=object(raw);keys(v,['id','draft','archived']);if(v.id!==undefined)text(v.id,256);if(v.archived!==undefined)boolean(v.archived);if(!v.id&&!v.draft||v.id&&v.draft===undefined&&v.archived===undefined||Object.values(v).some(x=>x===undefined))throw Error();return {id:v.id as string|undefined,draft:v.draft===undefined?undefined:normalizeRuleDraft(v.draft),archived:v.archived as boolean|undefined};});
   guard(ports.reader,ctx.actor);assertWalletCommandContext(ctx,ports.reader,!!value.id);
   return run(ctx,'save',value,tx=>{const reader=sqlReader(tx);guard(reader,ctx.actor);assertWalletCommandContext(ctx,reader,!!value.id);const before=value.id?owned(reader,ctx.actor,value.id):null;if(before&&(before.revision!==ctx.expectedRevision||before.revision>=Number.MAX_SAFE_INTEGER))fail(409,'Quy tắc vừa thay đổi.','edit-conflict');const draft=value.draft??normalizeRuleDraft(JSON.parse(before!.draft_json));catalog(reader,[draft]);const time=clock(),at=new Date(time).toISOString(),archived=value.archived===undefined?before?.archived_at??null:value.archived?before?.archived_at??at:null,json=JSON.stringify(draft);if(before&&json===before.draft_json&&archived===before.archived_at)return header(before);const budget=reader.get('SELECT count(*) AS n,COALESCE(sum(length(CAST(draft_json AS BLOB))),0) AS bytes FROM wallet_rules WHERE owner_id=?',ctx.actor.userId);if(!before&&budget.n>=1000||budget.bytes-(before?Buffer.byteLength(before.draft_json):0)+Buffer.byteLength(json)>4*1024*1024||!before&&reader.get('SELECT count(*) AS n FROM wallet_rules').n>=100000)fail(413,'Kho quy tắc đã đầy.','LIMIT_EXCEEDED');const id=before?.id??randomUUID(),revision=before?before.revision+1:1;
    if(before)tx.sql.run('UPDATE wallet_rules SET draft_json=?,archived_at=?,revision=?,updated_at=? WHERE id=?',json,archived,revision,at,id);else tx.sql.run('INSERT INTO wallet_rules VALUES(?,?,?,?,?,?,?)',id,ctx.actor.userId,json,archived,revision,at,at);
    const after={id,draft_json:json,archived_at:archived,revision},compact=(v:any)=>({id:v.id,revision:v.revision,archivedAt:v.archived_at,draftSha256:ruleHash(JSON.parse(v.draft_json))}),auditId=randomUUID();tx.audit.append({id:auditId,recordId:null,actorId:ctx.actor.userId,action:'wallet:rule:save'});tx.metadata.audit.set({auditId,occurredAt:at,before:before?compact(before):null,after:compact(after)});if(onChanged)tx.afterCommit(onChanged);return header(after);
   });
  },
  async previewRules(rawContext:CommandContext,raw:RulePreviewInput,rawFilter:RecordFilter,options:{signal?:AbortSignal}={}):Promise<RulePreviewSummary>{
   const ctx=structuredClone(rawContext),filter=input(()=>normalizeFilter(rawFilter)),request=previewInput(raw),initialScope=scope(ports.reader,ctx.actor);assertWalletCommandContext(ctx,ports.reader);
   // The I01 receipt binds the user's request, never values re-derived from a
   // later ledger/configuration. Lost acknowledgements cannot create a new preview.
   if(ports.reader.get("SELECT 1 FROM app_commands WHERE command='wallet:rule:preview' AND request_id=?",ctx.idempotencyKey))return run(ctx,'preview',{input:request,filter},()=>fail(409,'Không tìm thấy biên nhận xem trước.'));
   const {rules,refs}=loadRules(ports.reader,ctx.actor,request);catalog(ports.reader,rules);
   const entries=queries.captureSelection(ctx.actor,filter).entries;if(entries.length>10000)fail(413,'Bản xem trước giới hạn 10000 giao dịch.','LIMIT_EXCEEDED');const rows:RuleProposal[]=[];
   for(let i=0;i<entries.length;i++){if(options.signal?.aborted)fail(409,'Đã hủy xem trước.');const v=proposal(ports.reader,ctx.actor,entries[i].id,rules);if(v.revision!==entries[i].revision)fail(409,'Giao dịch vừa thay đổi.','edit-conflict');rows.push(v);if((i+1)%50===0)await yieldImmediate();}rows.sort(sort);
   if(options.signal?.aborted)fail(409,'Đã hủy xem trước.');const hash=ruleHash({rules,refs,rows});
   return run(ctx,'preview',{input:request,filter},tx=>{const reader=sqlReader(tx);guard(reader,ctx.actor);assertWalletCommandContext(ctx,reader);if(scope(reader,ctx.actor)!==initialScope)fail(409,'Quyền Wallet vừa thay đổi.');assertRefs(reader,ctx.actor,refs);catalog(reader,rules);for(const row of rows)if(JSON.stringify(proposal(reader,ctx.actor,row.id,rules))!==JSON.stringify(row))fail(409,'Giao dịch vừa thay đổi.','edit-conflict');const time=clock(),at=new Date(time).toISOString(),expires=new Date(time+900000).toISOString();tx.sql.run('DELETE FROM wallet_rule_previews WHERE expires_at<=?',at);if(reader.get('SELECT count(*) AS n FROM wallet_rule_previews WHERE owner_id=?',ctx.actor.userId).n>=5||reader.get('SELECT count(*) AS n FROM wallet_rule_previews').n>=100000||rows.length+reader.get('SELECT count(*) AS n FROM wallet_rule_preview_rows').n>100000)fail(413,'Kho xem trước đã đầy.','LIMIT_EXCEEDED');const id=randomUUID();tx.sql.run("INSERT INTO wallet_rule_previews VALUES(?,?,?,?,?,'ready',1,?,?,NULL)",id,ctx.actor.userId,JSON.stringify(rules),JSON.stringify(refs),hash,at,expires);tx.sql.run("INSERT INTO wallet_rule_preview_rows SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.revision'),value FROM json_each(?)",id,JSON.stringify(rows));return summary({id,preview_hash:hash,revision:1,state:'ready',created_at:at,expires_at:expires},rows);});
  },
  getPreview(actor:Actor,id:string){const {row,rows}=readPreview(actor,id);return summary(row,rows);},
  previewRows(actor:Actor,id:string){return readPreview(actor,id).rows;},
  applyRulePreview(rawContext:CommandContext,id:string,hash:string,onChanged?:(ids:string[])=>void){
   const ctx=structuredClone(rawContext);guard(ports.reader,ctx.actor);assertWalletCommandContext(ctx,ports.reader,true);input(()=>{text(id,256);if(!/^[a-f0-9]{64}$/.test(hash))throw Error();});readPreview(ctx.actor,id);
   return run(ctx,'apply',{id,hash},tx=>{const reader=sqlReader(tx);guard(reader,ctx.actor);assertWalletCommandContext(ctx,reader,true);const time=clock(),row=previewHeader(reader,ctx.actor,id,time);if(row.state!=='ready'||row.revision!==ctx.expectedRevision||row.preview_hash!==hash)fail(409,'Bản xem trước đã thay đổi.','edit-conflict');const rules=(JSON.parse(row.rules_json) as unknown[]).map(normalizeRuleDraft),refs=JSON.parse(row.rule_refs_json),rows=storedRows(reader,id);if(ruleHash({rules,refs,rows})!==hash)fail(409,'Bản xem trước không toàn vẹn.');assertRefs(reader,ctx.actor,refs);catalog(reader,rules);for(const v of rows)if(JSON.stringify(proposal(reader,ctx.actor,v.id,rules))!==JSON.stringify(v))fail(409,'Giao dịch hoặc quyền vừa thay đổi.','edit-conflict');const at=new Date(time).toISOString(),changed=rows.filter(v=>v.changed);
    for(const v of changed){if(v.revision>=Number.MAX_SAFE_INTEGER)fail(409,'Revision đã đầy.');const categoryChanged=v.before.categoryId!==v.after.categoryId,labelsChanged=JSON.stringify(v.before.labelIds)!==JSON.stringify(v.after.labelIds),reviewChanged=v.before.reviewed!==v.after.reviewed;
     tx.sql.run('UPDATE wallet_records SET category_id=?,revision=revision+1 WHERE id=?',v.after.categoryId,v.id);tx.sql.run('UPDATE wallet_record_metadata SET updated_at=?,updated_by=?'+(reviewChanged?',reviewed_at=?':'')+' WHERE record_id=?',at,ctx.actor.userId,...(reviewChanged?[at]:[]),v.id);
     if(labelsChanged){tx.sql.run('DELETE FROM wallet_record_labels WHERE record_id=?',v.id);for(const label of v.after.labelIds)tx.sql.run('INSERT INTO wallet_record_labels VALUES(?,?)',v.id,label);}
     tx.sql.run("INSERT INTO wallet_rule_overrides VALUES(?,?,0,0) ON CONFLICT(record_id) DO UPDATE SET category_origin=CASE WHEN ? THEN 'rule' ELSE category_origin END",v.id,categoryChanged?'rule':v.before.categoryId===null?'unclassified':'rule',Number(categoryChanged));const auditId=randomUUID();tx.audit.append({id:auditId,recordId:v.id,actorId:ctx.actor.userId,action:'wallet:rule:apply'});tx.metadata.audit.set({auditId,occurredAt:at,before:{revision:v.revision,...v.before},after:{revision:v.revision+1,...v.after,previewId:id,previewHash:hash}});
    }
    tx.sql.run("UPDATE wallet_rule_previews SET state='applied',revision=2,applied_request_id=? WHERE id=?",ctx.idempotencyKey,id);if(changed.length&&onChanged)tx.afterCommit(()=>onChanged(changed.map(v=>v.id)));return {id,revision:2,matched:rows.length,updated:changed.length,unchanged:rows.length-changed.length};
   });
  },
 };
}
