import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext,Money,Settlement} from '../../src/features/wallet/contracts.js';
import {object,keys,text,choice} from '../../src/features/productivity/validation.js';
import {assertMoney,minorInteger,convertMoney} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {assertWalletCommandContext} from './accounts.js';
import {createWalletAccess,assertWalletActor,type WalletReader} from './access.js';
import {openWalletStore,type WalletTx,type WalletRecord,type WalletPosting} from './store.js';
import {walletMetadataColumns,decodeMetadata,validateMetadata,type WalletRecordMetadata} from './metadata.js';
import type {WalletFxSnapshot} from './financial.js';
interface CommonDraft {effectiveDate:string;timezone:string;note?:string;occurredAt?:string|null;payee?:string;paymentMethod?:string;reviewedAt?:string|null;settlementStatus?:Exclude<Settlement,'voided'>;categoryId?:string|null;labelIds?:string[]}
interface FxDraft {numerator:string;denominator:string;asOf?:string}
interface FeeDraft {accountId:string;money:Money;note?:string;categoryId?:string|null}
export type RecordDraft=CommonDraft&({kind:'income'|'expense'|'adjustment';accountId:string;money:Money}|{kind:'transfer';fromAccountId:string|null;toAccountId:string|null;debit:Money;credit:Money;fx?:FxDraft|null;fee?:FeeDraft|null});
export type RecordPatch=Partial<CommonDraft>&{kind?:RecordDraft['kind'];accountId?:string;money?:Money;fromAccountId?:string|null;toAccountId?:string|null;debit?:Money;credit?:Money;fx?:FxDraft|null;fee?:FeeDraft|null};
export interface WalletRecordResult {record:WalletRecord;metadata:WalletRecordMetadata;postings:WalletPosting[];fx:WalletFxSnapshot|null;feeRecordId:string|null;labelIds:string[]}
export interface WalletRecordActions {recordId:string;canEdit:boolean;canVoid:boolean;editViaTransferId?:string}
type Draft=RecordDraft&Required<CommonDraft>;
const commonFields=['effectiveDate','timezone','note','occurredAt','payee','paymentMethod','reviewedAt','settlementStatus','categoryId','labelIds'];
const singleFields=['kind','accountId','money'],transferFields=['kind','fromAccountId','toAccountId','debit','credit','fx','fee'];
const fail=(status:number,message:string,code='wallet-record'):never=>{throw new AppStoreError(message,status,code);};
const txReader=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
function payload(value:unknown,allowed:string[]):Record<string,unknown>{try{const v=object(value);keys(v,allowed);if(Object.values(v).some(x=>x===undefined))throw Error();return structuredClone(v);}catch{fail(400,'Trường giao dịch không hợp lệ.');}}
function amount(value:unknown,signed=false):Money {assertMoney(value);const n=minorInteger(value.minor);if(n===0n||!signed&&n<0n)throw Error('Invalid record amount');return {minor:value.minor,currency:value.currency};}
function normalize(value:unknown):Draft {
 const raw=object(value);choice(raw.kind,['income','expense','adjustment','transfer']);const v=payload(value,[...commonFields,...(raw.kind==='transfer'?transferFields:singleFields)]);
 try{
  text(v.effectiveDate,10);parseEffectiveDate(v.effectiveDate);text(v.timezone,100);timezoneFormatter(v.timezone);const note=v.note===undefined?'':v.note; text(note,100000,false);
  const metadata={recordId:'validation-only',occurredAt:v.occurredAt===undefined?null:v.occurredAt,payee:v.payee===undefined?'':v.payee,paymentMethod:v.paymentMethod===undefined?'':v.paymentMethod,reviewedAt:v.reviewedAt===undefined?null:v.reviewedAt,createdAt:null,updatedAt:null,createdBy:null,updatedBy:null};validateMetadata('wallet_record_metadata',metadata);
  const settlementStatus=v.settlementStatus===undefined?'cleared':v.settlementStatus;choice(settlementStatus,['uncleared','cleared','reconciled']);const categoryId=v.categoryId===undefined?null:v.categoryId;if(categoryId!==null)text(categoryId,256);
  const labelIds=v.labelIds===undefined?[]:v.labelIds;if(!Array.isArray(labelIds)||labelIds.length>20||new Set(labelIds).size!==labelIds.length)throw Error('Invalid labels');for(const id of labelIds)text(id,256);
  const common={effectiveDate:v.effectiveDate,timezone:v.timezone,note,occurredAt:metadata.occurredAt,payee:metadata.payee,paymentMethod:metadata.paymentMethod,reviewedAt:metadata.reviewedAt,settlementStatus,categoryId,labelIds:[...labelIds].sort()};
  if(v.kind!=='transfer'){text(v.accountId,256);return {...common,kind:v.kind,accountId:v.accountId,money:amount(v.money,v.kind==='adjustment')} as Draft;}
  for(const key of ['fromAccountId','toAccountId'])if(v[key]!==null)text(v[key],256);if(v.fromAccountId===null&&v.toAccountId===null||v.fromAccountId===v.toAccountId)throw Error('Invalid transfer endpoints');
  const debit=amount(v.debit),credit=amount(v.credit);let fx:FxDraft|null=null;
  if(debit.currency===credit.currency){if(debit.minor!==credit.minor||v.fx!==undefined&&v.fx!==null)throw Error('Invalid same-currency transfer');}
  else{const r=object(v.fx);keys(r,['numerator','denominator','asOf']);fx={numerator:r.numerator as string,denominator:r.denominator as string,asOf:r.asOf===undefined?v.effectiveDate:r.asOf as string};text(fx.asOf,10);parseEffectiveDate(fx.asOf);if(convertMoney(debit,credit.currency,fx).minor!==credit.minor)throw Error('FX mismatch');}
  let fee:FeeDraft|null=null;if(v.fee!==undefined&&v.fee!==null){const r=payload(v.fee,['accountId','money','note','categoryId']);text(r.accountId,256);const note=r.note===undefined?'':r.note;text(note,100000,false);const categoryId=r.categoryId===undefined?null:r.categoryId;if(categoryId!==null)text(categoryId,256);fee={accountId:r.accountId,money:amount(r.money),note,categoryId} as FeeDraft;}
  return {...common,kind:'transfer',fromAccountId:v.fromAccountId,toAccountId:v.toAccountId,debit,credit,fx,fee} as Draft;
 }catch(error){if(error instanceof AppStoreError)throw error;fail(422,'Giá trị giao dịch không hợp lệ.');}
}
function targets(draft:Draft):{accountId:string;money:Money;fee?:boolean}[]{return draft.kind==='transfer'?[...(draft.fromAccountId===null?[]:[{accountId:draft.fromAccountId,money:draft.debit}]),...(draft.toAccountId===null?[]:[{accountId:draft.toAccountId,money:draft.credit}]),...(draft.fee?[{accountId:draft.fee.accountId,money:draft.fee.money,fee:true}]:[])]:[{accountId:draft.accountId,money:draft.money}];}
function checkTargets(reader:WalletReader,actor:Actor,draft:Draft,options:{archive?:boolean;previous?:Set<string>;previousFee?:Set<string>;otherCreator?:boolean}={}):void {
 const access=createWalletAccess(reader);for(const target of targets(draft)){const account=access.getAccount(actor,target.accountId);if(account.permission==='read'||options.otherCreator&&account.permission!=='manage')fail(403,'Không có quyền ghi vào tài khoản.');if(account.currency!==target.money.currency)fail(422,'Tiền tệ không khớp tài khoản.');if(options.archive&&account.archivedAt!==null&&!(target.fee?options.previousFee:options.previous)?.has(account.id))fail(409,'Tài khoản đã được lưu trữ.','wallet-account-archived');}
}
export function checkWalletCatalog(reader:WalletReader,id:string|null,labels:string[],before?:{record:{categoryId?:string};labelIds:string[]}):void {
 if(id!==null&&id!==before?.record.categoryId){const seen=new Set<string>();let next:string|null=id;while(next!==null){if(seen.has(next))fail(422,'Danh mục có vòng lặp.');seen.add(next);const row=reader.get('SELECT c.parent_id,c.archived_at,m.hidden FROM wallet_categories c LEFT JOIN wallet_category_metadata m ON m.category_id=c.id WHERE c.id=?',next);if(!row||row.archived_at!==null||row.hidden===1)fail(422,'Danh mục không thể được chọn.');next=row.parent_id;}}
 for(const label of labels)if(!before?.labelIds.includes(label)){const row=reader.get('SELECT l.archived_at,m.hidden FROM wallet_labels l LEFT JOIN wallet_label_metadata m ON m.label_id=l.id WHERE l.id=?',label);if(!row||row.archived_at!==null||row.hidden===1)fail(422,'Nhãn không thể được chọn.');}
}
function result(reader:WalletReader,actor:Actor,id:string):WalletRecordResult {
 const value=createWalletAccess(reader).getRecord(actor,id);if(value.partial)fail(404,'Không tìm thấy giao dịch có thể sửa.');const columns=walletMetadataColumns.wallet_record_metadata,row=reader.get('SELECT '+columns.join(',')+' FROM wallet_record_metadata WHERE record_id=?',id);if(!row)fail(409,'Thiếu metadata giao dịch.');
 return {record:value.record,metadata:decodeMetadata('wallet_record_metadata',row) as unknown as WalletRecordMetadata,postings:value.postings.map(({currency:_currency,...posting})=>posting),fx:reader.get('SELECT record_id AS recordId,from_currency AS fromCurrency,to_currency AS toCurrency,CAST(debit_minor AS TEXT) AS debitMinor,CAST(credit_minor AS TEXT) AS creditMinor,rate_numerator AS numerator,rate_denominator AS denominator,as_of AS asOf,source FROM wallet_record_fx WHERE record_id=?',id)??null,feeRecordId:reader.get('SELECT fee_record_id AS id FROM wallet_transfer_fees WHERE transfer_record_id=?',id)?.id??null,labelIds:reader.all('SELECT label_id AS id FROM wallet_record_labels WHERE record_id=? ORDER BY label_id',id).map(row=>row.id)};
}
function authorize(reader:WalletReader,actor:Actor,id:string):void {
 const access=createWalletAccess(reader);access.authorizeRecord(actor,id,'write');if(reader.get('SELECT 1 AS linked FROM wallet_transfer_fees WHERE fee_record_id=?',id))fail(409,'Sửa phí thông qua giao dịch chuyển khoản.','wallet-linked-fee');const fee=reader.get('SELECT fee_record_id AS id FROM wallet_transfer_fees WHERE transfer_record_id=?',id);if(fee)access.authorizeRecord(actor,fee.id,'write');
}
function asDraft(reader:WalletReader,actor:Actor,value:WalletRecordResult):RecordDraft {
 const {record:r,metadata:m}=value,common={effectiveDate:r.effectiveDate,timezone:r.timezone,note:r.note,occurredAt:m.occurredAt,payee:m.payee,paymentMethod:m.paymentMethod,reviewedAt:m.reviewedAt,settlementStatus:r.settlementStatus as Exclude<Settlement,'voided'>,categoryId:r.categoryId??null,labelIds:value.labelIds};
 if(r.kind==='trade')return fail(409,'Giao dịch đầu tư cần trình chỉnh sửa chuyên biệt.');
 if(r.kind!=='transfer'){const p=value.postings[0];if(value.postings.length!==1)fail(409,'Cấu trúc giao dịch không thể chỉnh sửa.');const n=minorInteger(p.deltaMinor);return {...common,kind:r.kind,accountId:p.accountId,money:{minor:(r.kind==='expense'?-n:n).toString(),currency:createWalletAccess(reader).getAccount(actor,p.accountId).currency}};}
 const outgoing=value.postings.find(p=>minorInteger(p.deltaMinor)<0n),incoming=value.postings.find(p=>minorInteger(p.deltaMinor)>0n),one=outgoing??incoming;if(!one)fail(409,'Thiếu posting chuyển khoản.');const currency=createWalletAccess(reader).getAccount(actor,one.accountId).currency;
 const debit=value.fx?{minor:value.fx.debitMinor,currency:value.fx.fromCurrency}:{minor:(outgoing?-minorInteger(outgoing.deltaMinor):minorInteger(incoming!.deltaMinor)).toString(),currency},credit=value.fx?{minor:value.fx.creditMinor,currency:value.fx.toCurrency}:{...debit};
 let fee:FeeDraft|null=null;if(value.feeRecordId){const valueFee=result(reader,actor,value.feeRecordId),p=valueFee.postings[0];fee={accountId:p.accountId,money:{minor:(-minorInteger(p.deltaMinor)).toString(),currency:createWalletAccess(reader).getAccount(actor,p.accountId).currency},note:valueFee.record.note,categoryId:valueFee.record.categoryId??null};}
 return {...common,kind:'transfer',fromAccountId:outgoing?.accountId??null,toAccountId:incoming?.accountId??null,debit,credit,fx:value.fx?{numerator:value.fx.numerator,denominator:value.fx.denominator,asOf:value.fx.asOf}:null,fee};
}
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):v;
function auditState(value:WalletRecordResult):Record<string,unknown>{const {note,...record}=value.record,{payee,paymentMethod,...metadata}=value.metadata;return {record,metadata,postings:value.postings,fx:value.fx,feeRecordId:value.feeRecordId,labelIds:value.labelIds,textDigests:Object.fromEntries(Object.entries({note,payee,paymentMethod}).map(([key,text])=>[key,{length:text.length,sha256:createHash('sha256').update(text).digest('hex')}]))};}
/** Only I01 writes; no lifecycle, provider, HTTP or legacy cutover on import. */
export function createWalletRecords(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),now=ports.now??Date.now;
 const context=(ctx:CommandContext,reader:WalletReader,editing=false)=>{assertWalletCommandContext(ctx,reader,editing);if(!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_record_fx' AND type='table'"))fail(409,'Cần nâng cấp schema Wallet.','wallet-storage-inactive');};
 const run=<T>(ctx:CommandContext,command:string,input:unknown,fn:(tx:WalletTx)=>T)=>store.transaction({actorId:ctx.actor.userId,command:'wallet:record:'+command,requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')},fn);
 const audit=(tx:WalletTx,actor:Actor,action:string,at:string,before:WalletRecordResult|null,after:WalletRecordResult)=>{const id=randomUUID();tx.audit.append({id,recordId:after.record.id,actorId:actor.userId,action:'wallet:record:'+action});tx.metadata.audit.set({auditId:id,occurredAt:at,before:before?auditState(before):null,after:auditState(after)});};
 const apply=(tx:WalletTx,actor:Actor,draft:Draft,at:string,before?:WalletRecordResult):WalletRecordResult=>{
  const reader=txReader(tx),id=before?.record.id??randomUUID();checkWalletCatalog(reader,draft.categoryId,draft.labelIds,before);
  if(before){if(before.record.occurrenceId)fail(409,'Cần quy trình sửa giao dịch định kỳ.');if(tx.sql.get('SELECT 1 AS present FROM wallet_allocations WHERE record_id=? LIMIT 1',id)&&JSON.stringify(before.postings)!==JSON.stringify(plannedPostings(id,draft)))fail(409,'Cần quy trình sửa phân bổ.');tx.sql.run('DELETE FROM wallet_record_fx WHERE record_id=?',id);tx.sql.run('DELETE FROM wallet_postings WHERE record_id=?',id);tx.sql.run('UPDATE wallet_records SET kind=?,effective_date=?,timezone=?,note=?,settlement_status=?,revision=revision+1,category_id=? WHERE id=?',draft.kind,draft.effectiveDate,draft.timezone,draft.note,draft.settlementStatus,draft.categoryId,id);}
  else tx.records.insert({id,kind:draft.kind,effectiveDate:draft.effectiveDate,timezone:draft.timezone,source:'manual',note:draft.note,settlementStatus:draft.settlementStatus,creatorId:actor.userId,revision:1,...(draft.categoryId===null?{}:{categoryId:draft.categoryId})});
  for(const posting of plannedPostings(id,draft))tx.postings.insert(posting);
  tx.metadata.records.set({recordId:id,occurredAt:draft.occurredAt,payee:draft.payee,paymentMethod:draft.paymentMethod,reviewedAt:draft.reviewedAt,createdAt:before?before.metadata.createdAt:at,createdBy:before?before.metadata.createdBy:actor.userId,updatedAt:at,updatedBy:actor.userId});tx.sql.run('DELETE FROM wallet_record_labels WHERE record_id=?',id);for(const label of draft.labelIds)tx.sql.run('INSERT INTO wallet_record_labels VALUES(?,?)',id,label);
  if(draft.kind==='transfer'&&draft.fx){const fx={recordId:id,fromCurrency:draft.debit.currency,toCurrency:draft.credit.currency,debitMinor:draft.debit.minor,creditMinor:draft.credit.minor,numerator:draft.fx.numerator,denominator:draft.fx.denominator,asOf:draft.fx.asOf??draft.effectiveDate,source:'manual'},prior=before?.fx;if(prior&&prior.fromCurrency===fx.fromCurrency&&prior.toCurrency===fx.toCurrency&&prior.numerator===fx.numerator&&prior.denominator===fx.denominator&&prior.asOf===fx.asOf)fx.source=prior.source;tx.financial.fx.insert(fx);}
  return result(reader,actor,id);
 };
 const voidWithin=(tx:WalletTx,actor:Actor,before:WalletRecordResult,at:string)=>{if(before.record.occurrenceId)fail(409,'Cần quy trình hủy giao dịch định kỳ.');tx.sql.run("UPDATE wallet_records SET settlement_status='voided',revision=revision+1 WHERE id=?",before.record.id);tx.metadata.records.set({...before.metadata,updatedAt:at,updatedBy:actor.userId});const after=result(txReader(tx),actor,before.record.id);audit(tx,actor,'void',at,before,after);return after;};
 const feeDraft=(parent:Draft,fee:FeeDraft):Draft=>normalize({effectiveDate:parent.effectiveDate,timezone:parent.timezone,note:fee.note??'',kind:'expense',accountId:fee.accountId,money:fee.money,categoryId:fee.categoryId??null,payee:parent.payee,paymentMethod:parent.paymentMethod,settlementStatus:parent.settlementStatus,occurredAt:parent.occurredAt,reviewedAt:parent.reviewedAt});
 const setFee=(tx:WalletTx,actor:Actor,parent:WalletRecordResult,draft:Draft,at:string,before?:WalletRecordResult,explicitFee=true)=>{
  const reader=txReader(tx),old=before?.feeRecordId?result(reader,actor,before.feeRecordId):undefined;
  if(draft.kind==='transfer'&&draft.fee){
   if(old?.record.settlementStatus==='voided'){if(explicitFee)fail(409,'Gỡ phí đã hủy trước khi thêm khoản phí mới.','wallet-voided-fee');return result(reader,actor,parent.record.id);}
   const prior=old?asDraft(reader,actor,old):undefined,fee=old?normalize({...prior,accountId:draft.fee.accountId,money:draft.fee.money,note:draft.fee.note??old.record.note,categoryId:draft.fee.categoryId??null}):feeDraft(draft,draft.fee);
   if(prior&&JSON.stringify(canonical(prior))===JSON.stringify(canonical(fee)))return result(reader,actor,parent.record.id);
   const after=apply(tx,actor,fee,at,old);if(!old)tx.financial.fees.link(parent.record.id,after.record.id);audit(tx,actor,old?'update':'create',at,old??null,after);
  }
  else if(old){if(old.record.settlementStatus!=='voided')voidWithin(tx,actor,old,at);tx.sql.run('DELETE FROM wallet_transfer_fees WHERE transfer_record_id=?',parent.record.id);}
  return result(reader,actor,parent.record.id);
 };
 return {
  getActions(actor:Actor,id:string):WalletRecordActions {
   const reader=ports.reader,access=createWalletAccess(reader),guard=()=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Wallet chưa sẵn sàng.');};guard();text(id,256);
   const visible=access.getRecord(actor,id);let allowed=false;
   try{authorize(reader,actor,id);allowed=true;}catch(error){if(!(error instanceof AppStoreError)||![403,404,409].includes(error.status))throw error;}
   const ordinary=allowed&&!visible.record.occurrenceId&&visible.record.kind!=='trade'&&visible.record.settlementStatus!=='voided';
   const result:WalletRecordActions={recordId:id,canEdit:ordinary,canVoid:ordinary},parent=reader.get('SELECT transfer_record_id AS id FROM wallet_transfer_fees WHERE fee_record_id=?',id);
   if(parent){try{access.getRecord(actor,parent.id);result.editViaTransferId=parent.id;}catch(error){if(!(error instanceof AppStoreError)||![403,404].includes(error.status))throw error;}}
   guard();access.getRecord(actor,id);return result;
  },
  createRecord(ctx:CommandContext,value:RecordDraft):WalletRecordResult {
   context(ctx,ports.reader);const draft=normalize(value);checkTargets(ports.reader,ctx.actor,draft);
   return run(ctx,'create',draft,tx=>{const reader=txReader(tx);context(ctx,reader);checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString(),parent=apply(tx,ctx.actor,draft,at),saved=setFee(tx,ctx.actor,parent,draft,at);audit(tx,ctx.actor,'create',at,null,saved);return saved;});
  },
  updateRecord(ctx:CommandContext,id:string,value:RecordPatch):WalletRecordResult {
   context(ctx,ports.reader,true);text(id,256);authorize(ports.reader,ctx.actor,id);const patch=payload(value,[...commonFields,...singleFields,...transferFields]);if(!Object.keys(patch).length)fail(400,'Thiếu thay đổi giao dịch.');
   return run(ctx,'update',{id,expectedRevision:ctx.expectedRevision,patch},tx=>{const reader=txReader(tx);context(ctx,reader,true);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==ctx.expectedRevision)fail(409,'Giao dịch vừa được thay đổi.','edit-conflict');if(before.record.settlementStatus==='voided')fail(409,'Giao dịch đã hủy.');if(patch.kind!==undefined&&patch.kind!==before.record.kind&&(!['income','expense','adjustment'].includes(before.record.kind)||!['income','expense','adjustment'].includes(patch.kind as string)))fail(422,'Chuyển khoản và đầu tư cần quy trình chuyển loại riêng.');const base=asDraft(reader,ctx.actor,before),merged:Record<string,unknown>={...base,...patch};if(base.kind==='transfer'&&base.fee&&patch.fee&&typeof patch.fee==='object'&&!Array.isArray(patch.fee))merged.fee={...base.fee,...patch.fee};const draft=normalize(merged),previous=new Set(before.postings.map(p=>p.accountId)),previousFee=new Set<string>();if(before.feeRecordId)for(const p of result(reader,ctx.actor,before.feeRecordId).postings)previousFee.add(p.accountId);checkTargets(reader,ctx.actor,draft,{archive:true,previous,previousFee,otherCreator:before.record.creatorId!==ctx.actor.userId});const at=new Date(now()).toISOString(),parent=apply(tx,ctx.actor,draft,at,before),saved=setFee(tx,ctx.actor,parent,draft,at,before,Object.hasOwn(patch,'fee'));audit(tx,ctx.actor,'update',at,before,saved);return saved;});
  },
  voidRecord(ctx:CommandContext,id:string):WalletRecordResult {
   context(ctx,ports.reader,true);text(id,256);authorize(ports.reader,ctx.actor,id);
   return run(ctx,'void',{id,expectedRevision:ctx.expectedRevision},tx=>{const reader=txReader(tx);context(ctx,reader,true);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==ctx.expectedRevision)fail(409,'Giao dịch vừa được thay đổi.','edit-conflict');if(before.record.settlementStatus==='voided')fail(409,'Giao dịch đã hủy.');if(before.record.kind==='trade')fail(409,'Cần quy trình hủy giao dịch đầu tư.');const at=new Date(now()).toISOString();if(before.feeRecordId)voidWithin(tx,ctx.actor,result(reader,ctx.actor,before.feeRecordId),at);return voidWithin(tx,ctx.actor,before,at);});
  },
 };
}
function plannedPostings(id:string,draft:Draft):WalletPosting[]{return draft.kind==='transfer'?[...(draft.fromAccountId===null?[]:[{recordId:id,accountId:draft.fromAccountId,deltaMinor:(-minorInteger(draft.debit.minor)).toString()}]),...(draft.toAccountId===null?[]:[{recordId:id,accountId:draft.toAccountId,deltaMinor:draft.credit.minor}])]:[{recordId:id,accountId:draft.accountId,deltaMinor:(draft.kind==='expense'?-minorInteger(draft.money.minor):minorInteger(draft.money.minor)).toString()}];}
