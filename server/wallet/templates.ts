import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext} from '../../src/features/wallet/contracts.js';
import {object,keys,text,boolean,integer} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {effectiveDateAt} from '../../src/features/wallet/dates.js';
import {recordDraftValue} from '../../src/features/wallet/recordDraftValue.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {assertWalletActor,createWalletAccess,type WalletReader} from './access.js';
import {assertWalletCommandContext} from './accounts.js';
import {normalizeWalletRecordDraft,validateWalletRecordDraft,type RecordDraft} from './records.js';
import {openWalletStore,type WalletTx} from './store.js';
export interface WalletTemplate {id:string;name:string;revision:number;archivedAt:string|null}
export interface TemplateDraft {id?:string;name?:string;draft?:RecordDraft;archived?:boolean}
const fail=(status:number,message:string,code='wallet-template'):never=>{throw new AppStoreError(message,status,code);};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)])):value;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const txReader=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
function guard(reader:WalletReader,actor:Actor){assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_templates' AND type='table'"))fail(409,'Kho mẫu Wallet chưa sẵn sàng.');}
function header(raw:any):WalletTemplate {try{text(raw.id,256);text(raw.name,500);integer(raw.revision,1);if(raw.archived_at!==null){text(raw.archived_at,24);if(new Date(raw.archived_at).toISOString()!==raw.archived_at)throw Error();}return {id:raw.id,name:raw.name,revision:raw.revision,archivedAt:raw.archived_at};}catch{fail(422,'Mẫu không hợp lệ.');}}
function owned(reader:WalletReader,actor:Actor,id:string){text(id,256);const row=reader.get('SELECT * FROM wallet_templates WHERE id=? AND owner_id=?',id,actor.userId);if(!row)fail(404,'Không tìm thấy mẫu.');header(row);if(row.created_by!==actor.userId||row.updated_by!==actor.userId||typeof row.draft_json!=='string'||row.draft_json.length>512000)fail(422,'Dữ liệu mẫu không nhất quán.');return row;}
function parse(raw:unknown):TemplateDraft {try{
 const value=object(raw);keys(value,['id','name','draft','archived']);if(!Object.keys(value).length||Object.values(value).some(item=>item===undefined))throw Error();
 if(value.id===undefined&&(value.name===undefined||value.draft===undefined)||value.id!==undefined&&Object.keys(value).length===1)throw Error();const result:TemplateDraft={};
 if(value.id!==undefined){text(value.id,256);result.id=value.id;}if(value.name!==undefined){text(value.name,500);result.name=value.name;}if(value.archived!==undefined){boolean(value.archived);result.archived=value.archived;}if(value.draft!==undefined)result.draft=normalizeWalletRecordDraft(value.draft);return result;
 }catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Trường mẫu không hợp lệ.');}}

function readDraft(reader:WalletReader,actor:Actor,row:any):RecordDraft {let draft:RecordDraft;try{draft=recordDraftValue(JSON.parse(row.draft_json));}catch{fail(422,'Nội dung mẫu không hợp lệ.');}const access=createWalletAccess(reader),account=(id:string,currency:string)=>{if(access.getAccount(actor,id).currency!==currency)fail(422,'Tiền tệ mẫu không khớp tài khoản.');};if(draft.kind==='transfer'){if(draft.fromAccountId)account(draft.fromAccountId,draft.debit.currency);if(draft.toAccountId)account(draft.toAccountId,draft.credit.currency);if(draft.fee)account(draft.fee.accountId,draft.fee.money.currency);}else account(draft.accountId,draft.money.currency);return draft;}
/** Personal configuration; metadata-only receipts never expose a financial draft.
 * All writes remain inside the existing I01 owner, with no provider or timer. */
export function createWalletTemplates(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),now=()=>new Date((ports.now??Date.now)()).toISOString();
 return {
  listTemplates(actor:Actor):WalletTemplate[]{guard(ports.reader,actor);const rows=ports.reader.all('SELECT id,name,revision,archived_at FROM wallet_templates WHERE owner_id=? ORDER BY id LIMIT 1001',actor.userId);if(rows.length>1000)fail(413,'Quá nhiều mẫu.','LIMIT_EXCEEDED');const result=rows.map(header);guard(ports.reader,actor);return result;},
  getTemplate(actor:Actor,id:string){guard(ports.reader,actor);const row=owned(ports.reader,actor,id),draft=readDraft(ports.reader,actor,row);guard(ports.reader,actor);if(owned(ports.reader,actor,id).revision!==row.revision)fail(409,'Mẫu vừa thay đổi.');return {...header(row),draft};},
  instantiateTemplate(actor:Actor,id:string,instant:string):RecordDraft {guard(ports.reader,actor);try{utcInstant(instant);}catch{fail(422,'Thời điểm áp dụng mẫu không hợp lệ.');}const row=owned(ports.reader,actor,id);if(row.archived_at!==null)fail(409,'Mẫu đã được lưu trữ.');const source=readDraft(ports.reader,actor,row),draft=validateWalletRecordDraft(ports.reader,actor,{...source,effectiveDate:effectiveDateAt(instant,source.timezone),occurredAt:instant,reviewedAt:null,settlementStatus:'uncleared'});guard(ports.reader,actor);if(owned(ports.reader,actor,id).revision!==row.revision)fail(409,'Mẫu vừa thay đổi.');return draft;},
  saveTemplate(rawContext:CommandContext,raw:TemplateDraft,onChanged?:()=>void):WalletTemplate {
   const ctx=structuredClone(rawContext);guard(ports.reader,ctx.actor);const value=parse(raw);assertWalletCommandContext(ctx,ports.reader,!!value.id);
   return store.transaction({actorId:ctx.actor.userId,command:'wallet:template:save',requestId:ctx.idempotencyKey,payloadHash:hash({revision:ctx.expectedRevision??0,input:value})},tx=>{const reader=txReader(tx);guard(reader,ctx.actor);assertWalletCommandContext(ctx,reader,!!value.id);const before=value.id?owned(reader,ctx.actor,value.id):null;if(before&&(before.revision!==ctx.expectedRevision||before.revision>=Number.MAX_SAFE_INTEGER))fail(409,'Mẫu vừa thay đổi.','edit-conflict');
    const id=before?.id??randomUUID(),at=now(),draft=value.draft===undefined?before!.draft_json:JSON.stringify(validateWalletRecordDraft(reader,ctx.actor,value.draft)),name=value.name??before!.name,archived=value.archived===undefined?before?.archived_at??null:value.archived?before?.archived_at??at:null;
    if(before&&name===before.name&&draft===before.draft_json&&archived===before.archived_at)return header(before);
    const budget=tx.sql.get('SELECT count(*) AS n,COALESCE(sum(length(CAST(draft_json AS BLOB))),0) AS bytes FROM wallet_templates WHERE owner_id=? AND id!=?',ctx.actor.userId,id);if((!before&&budget.n>=1000)||budget.bytes+Buffer.byteLength(draft)>8*1024*1024)fail(413,'Kho mẫu vượt giới hạn.','LIMIT_EXCEEDED');
    const revision=before?before.revision+1:1;if(before)tx.sql.run('UPDATE wallet_templates SET name=?,draft_json=?,archived_at=?,revision=?,updated_at=?,updated_by=? WHERE id=? AND owner_id=?',name,draft,archived,revision,at,ctx.actor.userId,id,ctx.actor.userId);else tx.sql.run('INSERT INTO wallet_templates VALUES(?,?,?,?,?,?,?,?,?,?)',id,ctx.actor.userId,name,draft,archived,revision,at,at,ctx.actor.userId,ctx.actor.userId);
    const compact=(row:any)=>({id:row.id,ownerId:ctx.actor.userId,nameDigest:{length:row.name.length,sha256:createHash('sha256').update(row.name).digest('hex')},revision:row.revision,archivedAt:row.archived_at,draftSha256:createHash('sha256').update(row.draft_json).digest('hex')}),after={id,name,revision,archived_at:archived,draft_json:draft},auditId=randomUUID();tx.audit.append({id:auditId,recordId:null,actorId:ctx.actor.userId,action:'wallet:template:'+(before?'update':'create')});tx.metadata.audit.set({auditId,occurredAt:at,before:before?compact(before):null,after:compact(after)});if(onChanged)tx.afterCommit(onChanged);return header(after);
   });
  },
 };
}
